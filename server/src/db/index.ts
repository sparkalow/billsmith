/**
 * SQLite connection, pragmas, and migration runner.
 *
 * Uses Node's built-in `node:sqlite` (Node >= 22.5), which avoids a native compile
 * step entirely. This module is deliberately the only file that touches the driver
 * API directly — if node:sqlite proves too limited, swapping in better-sqlite3
 * means changing this file and nothing else.
 */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'migrations');

export type Db = DatabaseSync;

export function defaultDbPath(): string {
    return (
        process.env.DB_PATH ??
        resolve(__dirname, '..', '..', '..', 'data', 'invoices.db')
    );
}

/** Open a connection with the pragmas this app depends on. */
export function openDb(path: string = defaultDbPath()): Db {
    if (path !== ':memory:') {
        mkdirSync(dirname(path), { recursive: true });
    }
    const db = new DatabaseSync(path);
    // foreign_keys is per-connection and off by default; the schema relies on it.
    db.exec('PRAGMA foreign_keys = ON');
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA busy_timeout = 5000');
    return db;
}

/**
 * Apply any migrations not yet recorded, in filename order.
 * Each migration runs inside its own transaction, so a failure leaves the database
 * at the last known-good version rather than half-migrated.
 */
export function migrate(db: Db, log: (msg: string) => void = () => {}): number {
    db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
        version    INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    const applied = new Set(
        (db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[])
            .map((r) => r.version),
    );

    const files = readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith('.sql'))
        .sort();

    let count = 0;
    for (const file of files) {
        const version = Number(file.split('_')[0]);
        if (!Number.isInteger(version)) {
            throw new Error(`Migration "${file}" must start with an integer version`);
        }
        if (applied.has(version)) continue;

        const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
        db.exec('BEGIN');
        try {
            db.exec(sql);
            db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(version);
            db.exec('COMMIT');
        } catch (err) {
            db.exec('ROLLBACK');
            throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
        }
        log(`applied ${file}`);
        count++;
    }
    return count;
}

/**
 * Typed query helpers.
 *
 * node:sqlite returns `Record<string, SQLOutputValue>`, which cannot be cast directly
 * to a row interface. Rather than scattering `as unknown as T` across every query
 * module, the unsafe cast lives here — the one file that is allowed to know about the
 * driver — so swapping drivers stays a single-file change.
 *
 * The cast is unchecked by design: the schema, not TypeScript, is the guarantee that
 * these columns exist.
 */
export type SqlParam = string | number | bigint | null | Uint8Array;

/** Query returning many rows. */
export function all<T>(db: Db, sql: string, ...params: SqlParam[]): T[] {
    return db.prepare(sql).all(...params) as unknown as T[];
}

/** Query returning a single row, or undefined. */
export function get<T>(db: Db, sql: string, ...params: SqlParam[]): T | undefined {
    return db.prepare(sql).get(...params) as unknown as T | undefined;
}

/** Statement with no result set. */
export function run(
    db: Db,
    sql: string,
    ...params: SqlParam[]
): { changes: number; lastInsertRowid: number } {
    const result = db.prepare(sql).run(...params);
    return {
        changes: Number(result.changes),
        lastInsertRowid: Number(result.lastInsertRowid),
    };
}

let savepointCounter = 0;

/**
 * Run `fn` inside a transaction, rolling back if it throws.
 *
 * Re-entrant: SQLite rejects a nested BEGIN, but composing transactional operations
 * is normal (a caller wrapping several createInvoice calls wants one atomic unit).
 * When already inside a transaction this uses a SAVEPOINT, so an inner failure
 * unwinds only the inner work and the outer transaction decides the final outcome.
 */
export function transaction<T>(db: Db, fn: () => T): T {
    if (db.isTransaction) {
        const name = `sp_${++savepointCounter}`;
        db.exec(`SAVEPOINT ${name}`);
        try {
            const result = fn();
            db.exec(`RELEASE ${name}`);
            return result;
        } catch (err) {
            db.exec(`ROLLBACK TO ${name}`);
            db.exec(`RELEASE ${name}`);
            throw err;
        }
    }

    db.exec('BEGIN');
    try {
        const result = fn();
        db.exec('COMMIT');
        return result;
    } catch (err) {
        db.exec('ROLLBACK');
        throw err;
    }
}

/** Open, migrate, and seed in one call. Used by the server and by the scripts. */
export function initDb(path?: string, log?: (msg: string) => void): Db {
    const db = openDb(path);
    migrate(db, log);
    return db;
}
