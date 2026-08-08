/**
 * Date formatting.
 *
 * Everything is stored as TEXT `YYYY-MM-DD`: sortable, comparable, unambiguous.
 * Display formatting happens at the edge, never in the database.
 */

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

function iso(year: number, month: number, day: number): string {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** `2026-08-01` -> `08-01-2026`, the format the printed invoice has always used. */
export function formatInvoiceDate(isoDate: string): string {
    const m = ISO.exec(isoDate);
    if (!m) throw new Error(`Expected YYYY-MM-DD, got "${isoDate}"`);
    return `${m[2]}-${m[3]}-${m[1]}`;
}

/** `2026-08-01` -> `08/01/2026`, the format used for line-item dates. */
export function formatLineItemDate(isoDate: string): string {
    const m = ISO.exec(isoDate);
    if (!m) throw new Error(`Expected YYYY-MM-DD, got "${isoDate}"`);
    return `${m[2]}/${m[3]}/${m[1]}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-08-01` -> `Aug 2026`. Replaces the legacy `fdate` filter. */
export function formatMonthYear(isoDate: string): string {
    const m = ISO.exec(isoDate);
    if (!m) throw new Error(`Expected YYYY-MM-DD, got "${isoDate}"`);
    return `${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** Add days to an ISO date, returning an ISO date. Used for net-30 due dates. */
export function addDays(isoDate: string, days: number): string {
    const m = ISO.exec(isoDate);
    if (!m) throw new Error(`Expected YYYY-MM-DD, got "${isoDate}"`);
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    d.setUTCDate(d.getUTCDate() + days);
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}
