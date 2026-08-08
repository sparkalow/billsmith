import type { Db } from '../index.js';
import { all, get, run } from '../index.js';
import type { CustomerRow } from '../../../../shared/types.js';

export function listCustomers(db: Db, includeArchived = false): CustomerRow[] {
    return all<CustomerRow>(
        db,
        `SELECT * FROM customers
         ${includeArchived ? '' : 'WHERE archived = 0'}
         ORDER BY name`,
    );
}

export function getCustomer(db: Db, id: number): CustomerRow | null {
    return get<CustomerRow>(db, 'SELECT * FROM customers WHERE id = ?', id) ?? null;
}

export function createCustomer(
    db: Db,
    input: { name: string; address_1?: string; address_2?: string; default_rate_cents?: number | null },
): CustomerRow {
    const { lastInsertRowid } = run(
        db,
        'INSERT INTO customers (name, address_1, address_2, default_rate_cents) VALUES (?, ?, ?, ?)',
        input.name,
        input.address_1 ?? '',
        input.address_2 ?? '',
        input.default_rate_cents ?? null,
    );
    return getCustomer(db, lastInsertRowid)!;
}

const UPDATABLE = ['name', 'address_1', 'address_2', 'default_rate_cents', 'archived'] as const;

export function updateCustomer(
    db: Db,
    id: number,
    patch: Partial<Pick<CustomerRow, (typeof UPDATABLE)[number]>>,
): CustomerRow | null {
    const entries = UPDATABLE
        .filter((col) => patch[col] !== undefined)
        .map((col) => [col, patch[col] ?? null] as const);

    if (entries.length === 0) {return getCustomer(db, id);}

    const { changes } = run(
        db,
        `UPDATE customers SET ${entries.map(([c]) => `${c} = ?`).join(', ')} WHERE id = ?`,
        ...entries.map(([, v]) => v as string | number | null),
        id,
    );
    return changes > 0 ? getCustomer(db, id) : null;
}
