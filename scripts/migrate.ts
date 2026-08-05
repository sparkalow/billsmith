#!/usr/bin/env tsx
/**
 * Apply pending migrations and seed defaults.
 *
 *   npm run db:migrate              # default data/invoices.db
 *   npm run db:migrate -- /tmp/x.db # explicit path
 */

import { openDb, migrate, defaultDbPath } from '../server/src/db/index.js';
import { seed } from '../server/src/db/seed.js';

const path = process.argv[2] ?? defaultDbPath();
const db = openDb(path);

const applied = migrate(db, (msg) => console.log(`  ${msg}`));
seed(db);

const version = db
    .prepare('SELECT MAX(version) AS v FROM schema_migrations')
    .get() as { v: number | null };

console.log(
    applied > 0
        ? `Applied ${applied} migration(s). Schema version ${version.v} at ${path}`
        : `Already up to date. Schema version ${version.v} at ${path}`,
);

db.close();
