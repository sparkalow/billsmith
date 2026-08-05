/**
 * Date normalization.
 *
 * Everything is stored as TEXT `YYYY-MM-DD`: sortable, comparable, unambiguous.
 * Display formatting happens at the edge.
 *
 * The legacy markdown carries five different formats, because get-wrike-time.js built
 * YAML by string concatenation and nothing ever parsed the result back:
 *   MM-DD-YYYY   invoice_date (17 files)      04-01-2026
 *   YYYY-MM-DD   invoice_due_date (2 files)   2026-08-01
 *   M/D/YYYY     line item dates              4/1/2025
 *   MM/DD/YYYY   line item dates              04/01/2026
 *   YYYY/MM/DD   line item dates (mar-2026)   2026/03/03
 *
 * Disambiguation rule: a 4-digit leading component means year-first, otherwise the
 * year is last and the order is month-first. `2026/03/03` and `04/01/2026` are both
 * unambiguous under that rule; a bare `03/04/05` is not, and is rejected rather than
 * guessed at.
 */

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const YEAR_FIRST = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/;
const MONTH_FIRST = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;

function isRealDate(year: number, month: number, day: number): boolean {
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;
    const d = new Date(Date.UTC(year, month - 1, day));
    return (
        d.getUTCFullYear() === year &&
        d.getUTCMonth() === month - 1 &&
        d.getUTCDate() === day
    );
}

function iso(year: number, month: number, day: number): string {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Normalize any of the known legacy formats to `YYYY-MM-DD`.
 * Throws on anything unrecognized — the importer must fail loudly rather than
 * silently transposing a month and a day.
 */
export function normalizeDate(input: string | Date, context = ''): string {
    const where = context ? ` (${context})` : '';

    if (input instanceof Date) {
        if (Number.isNaN(input.getTime())) {
            throw new Error(`Invalid Date object${where}`);
        }
        return iso(input.getUTCFullYear(), input.getUTCMonth() + 1, input.getUTCDate());
    }

    const value = String(input).trim();
    if (!value) {
        throw new Error(`Empty date${where}`);
    }

    for (const pattern of [ISO, YEAR_FIRST]) {
        const m = pattern.exec(value);
        if (m) {
            const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
            if (!isRealDate(year, month, day)) {
                throw new Error(`Impossible date "${value}"${where}`);
            }
            return iso(year, month, day);
        }
    }

    const m = MONTH_FIRST.exec(value);
    if (m) {
        const [month, day, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
        if (!isRealDate(year, month, day)) {
            throw new Error(`Impossible date "${value}"${where}`);
        }
        return iso(year, month, day);
    }

    throw new Error(`Unrecognized date format "${value}"${where}`);
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

/** First and last day of the month containing `isoDate`. */
export function monthBounds(isoDate: string): { start: string; end: string } {
    const m = ISO.exec(isoDate);
    if (!m) throw new Error(`Expected YYYY-MM-DD, got "${isoDate}"`);
    const year = Number(m[1]);
    const month = Number(m[2]);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return { start: iso(year, month, 1), end: iso(year, month, lastDay) };
}
