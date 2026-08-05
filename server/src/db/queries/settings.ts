import type { Db } from '../index.js';
import { get, run } from '../index.js';
import type { SettingsRow } from '../../../../shared/types.js';

export function getSettings(db: Db): SettingsRow {
    return get<SettingsRow>(db, 'SELECT * FROM settings WHERE id = 1')!;
}

const UPDATABLE = [
    'business_name', 'business_address_1', 'business_address_2',
    'default_terms_html', 'default_rate_cents', 'default_net_days', 'wrike_contact_id',
] as const;

export function updateSettings(
    db: Db,
    patch: Partial<Pick<SettingsRow, (typeof UPDATABLE)[number]>>,
): SettingsRow {
    const entries = UPDATABLE
        .filter((col) => patch[col] !== undefined)
        .map((col) => [col, patch[col] ?? null] as const);

    if (entries.length > 0) {
        run(
            db,
            `UPDATE settings SET ${entries.map(([c]) => `${c} = ?`).join(', ')}, ` +
            `updated_at = datetime('now') WHERE id = 1`,
            ...entries.map(([, v]) => v as string | number | null),
        );
    }
    return getSettings(db);
}
