/**
 * Report aggregates. All money in cents, durations in minutes, dates as YYYY-MM-DD.
 *
 * Every figure is summed from the `invoice_totals` view rather than recomputed in JS,
 * for the same reason the list and detail views read from it: the reports must never
 * disagree with the invoices they summarise.
 *
 * Status vocabulary, applied identically in every query here:
 *   billed      status IN ('sent', 'paid')  — issued, real money owed
 *   collected   status = 'paid'
 *   outstanding status = 'sent'             — issued, unpaid
 *   draft       status = 'draft'            — not yet issued, never inside billed
 *   void        excluded everywhere
 */

import type { Db } from '../index.js';
import { all } from '../index.js';
import type {
    YearlyTotalsRow,
    CustomerTotalsRow,
    OutstandingInvoiceRow,
    AgingBuckets,
    OutstandingReport,
} from '../../../../shared/types.js';

/**
 * The status split, shared verbatim by the yearly and per-customer reports so the two
 * can never drift apart. Counts and minutes cover all non-void invoices, drafts
 * included — the draft column is shown beside them.
 */
const STATUS_TOTALS = `
    COUNT(*) AS invoice_count,
    COALESCE(SUM(t.total_minutes), 0) AS total_minutes,
    COALESCE(SUM(CASE WHEN i.status IN ('sent','paid') THEN t.total_cents END), 0)
        AS billed_cents,
    COALESCE(SUM(CASE WHEN i.status = 'paid'  THEN t.total_cents END), 0)
        AS collected_cents,
    COALESCE(SUM(CASE WHEN i.status = 'sent'  THEN t.total_cents END), 0)
        AS outstanding_cents,
    COALESCE(SUM(CASE WHEN i.status = 'draft' THEN t.total_cents END), 0)
        AS draft_cents`;

/**
 * Totals per calendar year of issue_date.
 *
 * Grouped on the four-character date prefix rather than a date function: issue_date is
 * stored as a CHECK-constrained 'YYYY-MM-DD' string, so the prefix *is* the year.
 */
export function yearlyTotals(db: Db): YearlyTotalsRow[] {
    return all<YearlyTotalsRow>(
        db,
        `SELECT substr(i.issue_date, 1, 4) AS year, ${STATUS_TOTALS}
         FROM invoices i
         JOIN invoice_totals t ON t.invoice_id = i.id
         WHERE i.status <> 'void'
         GROUP BY year
         ORDER BY year DESC`,
    );
}

/**
 * Totals per customer, all time.
 *
 * Grouped on customer_id, not the invoice's snapshotted customer_name, so renaming a
 * customer does not split their history into two rows. The displayed name is the
 * current one, falling back to the snapshot if the customer row has gone.
 */
export function customerTotals(db: Db): CustomerTotalsRow[] {
    return all<CustomerTotalsRow>(
        db,
        `SELECT
             i.customer_id,
             COALESCE(c.name, MIN(i.customer_name)) AS customer_name,
             ${STATUS_TOTALS}
         FROM invoices i
         JOIN invoice_totals t ON t.invoice_id = i.id
         LEFT JOIN customers c ON c.id = i.customer_id
         WHERE i.status <> 'void'
         GROUP BY i.customer_id
         ORDER BY billed_cents DESC, customer_name`,
    );
}

/**
 * Every issued-but-unpaid invoice, oldest due first.
 *
 * The schema has no 'overdue' status, so age is derived from due_date against SQLite's
 * date('now') — UTC, matching the paid_date auto-fill in updateInvoice. A zero or
 * negative days_overdue means the invoice is not yet due.
 */
export function outstandingInvoices(db: Db): OutstandingInvoiceRow[] {
    return all<OutstandingInvoiceRow>(
        db,
        `SELECT
             i.id, i.invoice_number, i.customer_name, i.issue_date, i.due_date,
             t.total_cents,
             CAST(julianday(date('now')) - julianday(i.due_date) AS INTEGER) AS days_overdue
         FROM invoices i
         JOIN invoice_totals t ON t.invoice_id = i.id
         WHERE i.status = 'sent'
         ORDER BY i.due_date ASC, i.id ASC`,
    );
}

/**
 * Fold outstanding invoices into age buckets.
 *
 * Derived from the rows above rather than a second SQL pass — one query, one definition
 * of "outstanding", and the bucket boundaries stay next to the rows they describe.
 */
export function agingBuckets(rows: OutstandingInvoiceRow[]): AgingBuckets {
    const buckets: AgingBuckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
    for (const row of rows) {
        const days = row.days_overdue;
        if (days <= 0) {
            buckets.current += row.total_cents;
        } else if (days <= 30) {
            buckets.d1_30 += row.total_cents;
        } else if (days <= 60) {
            buckets.d31_60 += row.total_cents;
        } else if (days <= 90) {
            buckets.d61_90 += row.total_cents;
        } else {
            buckets.d90_plus += row.total_cents;
        }
    }
    return buckets;
}

export function outstandingReport(db: Db): OutstandingReport {
    const invoices = outstandingInvoices(db);
    return {
        invoices,
        buckets: agingBuckets(invoices),
        total_cents: invoices.reduce((sum, row) => sum + row.total_cents, 0),
    };
}
