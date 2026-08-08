/**
 * Duration and money helpers.
 *
 * Minutes (INTEGER) are the source of truth for time; `H:MM` is a display format only.
 * Money is INTEGER cents everywhere — no floats in money math.
 *
 * These replace `addUpTimeLogs` / `convertTimeToHours` / `formatNumber` from the legacy
 * eleventy.config.js. Two legacy bugs are fixed here:
 *   - minutes are always zero-padded (legacy rendered a 5-minute total as "3:5")
 *   - an empty line-item set totals 0 rather than throwing on undefined
 */

/** Parse an `H:MM` duration into whole minutes. Throws on malformed input. */
export function parseHM(value: string): number {
    const match = /^(\d+):([0-5]?\d)$/.exec(value.trim());
    if (!match) {
        throw new Error(`Malformed duration "${value}" (expected H:MM)`);
    }
    return Number(match[1]) * 60 + Number(match[2]);
}

/** Format whole minutes as `H:MM`, always zero-padding the minutes. */
export function formatHM(minutes: number): string {
    const safe = Math.max(0, Math.round(minutes));
    return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

/**
 * Billable amount in cents.
 *
 * Mirrors the SQL in the `invoice_totals` view exactly, so client-side previews and
 * server-side totals never disagree. Verified against the legacy build: 190 minutes at
 * 8500 cents/hr => 26917 cents ($269.17).
 */
export function amountCents(minutes: number, rateCents: number): number {
    return Math.round((minutes * rateCents) / 60);
}

/** Tax in cents, applied to an already-rounded subtotal. */
export function taxCents(subtotalCents: number, taxRate: number): number {
    return Math.round(subtotalCents * taxRate);
}

/** Format integer cents as USD. Replaces the legacy `formatNumber` filter. */
export function formatUSD(cents: number): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(cents / 100);
}

/** Parse a user-entered dollar amount ("85", "$85.00", "1,200.50") into cents. */
export function parseUSD(value: string | number): number {
    if (typeof value === 'number') return Math.round(value * 100);
    const cleaned = value.replace(/[$,\s]/g, '');
    const parsed = Number(cleaned);
    if (!Number.isFinite(parsed)) {
        throw new Error(`Malformed amount "${value}"`);
    }
    return Math.round(parsed * 100);
}
