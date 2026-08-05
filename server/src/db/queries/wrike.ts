/**
 * Wrike timelog caching and conversion into draft invoices.
 *
 * Raw pulls are cached in `wrike_timelogs` so an import can be reviewed, re-run, or
 * reconciled without hitting the API again — and so the provenance of every imported
 * line item stays traceable back to the timelog it came from.
 */

import type { Db } from '../index.js';
import { all, get, run, transaction } from '../index.js';
import type { WrikeTimelogPreview, InvoiceDetail } from '../../../../shared/types.js';
import type { WrikeTimelog } from '../../wrike/client.js';
import { decimalHoursToMinutes } from '../../../../shared/duration.js';
import { monthBounds, addDays } from '../../../../shared/dates.js';
import { createInvoice, suggestInvoiceNumber } from './invoices.js';

/** Upsert raw timelogs, preserving any existing link to a line item. */
export function cacheTimelogs(db: Db, logs: WrikeTimelog[]): void {
    const upsert = db.prepare(
        `INSERT INTO wrike_timelogs (
            id, task_id, user_id, tracked_date, hours, comment,
            created_date, updated_date, fetched_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
            task_id = excluded.task_id,
            user_id = excluded.user_id,
            tracked_date = excluded.tracked_date,
            hours = excluded.hours,
            comment = excluded.comment,
            updated_date = excluded.updated_date,
            fetched_at = datetime('now')`,
    );
    transaction(db, () => {
        for (const log of logs) {
            upsert.run(
                log.id,
                log.taskId ?? null,
                log.userId ?? null,
                log.trackedDate,
                log.hours,
                log.comment ?? '',
                log.createdDate ?? null,
                log.updatedDate ?? null,
            );
        }
    });
}

/**
 * Timelogs in a range, converted to minutes and flagged if already billed.
 * The `already_imported` flag is what stops the same work being invoiced twice —
 * something the legacy script had no way to detect.
 */
export function previewRange(db: Db, start: string, end: string): WrikeTimelogPreview[] {
    const rows = all<{
        id: string; task_id: string | null; tracked_date: string;
        hours: number; comment: string; used: number;
    }>(
        db,
        `SELECT w.id, w.task_id, w.tracked_date, w.hours, w.comment,
                (SELECT COUNT(*) FROM line_items li WHERE li.wrike_timelog_id = w.id) AS used
         FROM wrike_timelogs w
         WHERE w.tracked_date BETWEEN ? AND ?
         ORDER BY w.tracked_date, w.id`,
        start,
        end,
    );

    return rows.map((r) => ({
        id: r.id,
        task_id: r.task_id,
        tracked_date: r.tracked_date,
        hours_raw: r.hours,
        minutes: decimalHoursToMinutes(r.hours),
        comment: r.comment,
        already_imported: r.used > 0,
    }));
}

export interface RangeOverlap {
    id: number;
    invoice_number: string;
    issue_date: string;
    item_count: number;
}

/**
 * Invoices that already carry line items dated inside the range.
 *
 * The `already_imported` flag on a timelog only catches work billed through this app,
 * because it depends on wrike_timelog_id. Every invoice migrated from the legacy
 * markdown has no timelog ids at all — so re-fetching a month that was invoiced by the
 * old CLI would look completely fresh and quietly double-bill it. This check works off
 * work dates instead, so it catches those too.
 */
export function overlappingInvoices(db: Db, start: string, end: string): RangeOverlap[] {
    return all<RangeOverlap>(
        db,
        `SELECT i.id, i.invoice_number, i.issue_date, COUNT(li.id) AS item_count
         FROM invoices i
         JOIN line_items li ON li.invoice_id = i.id
         WHERE li.work_date BETWEEN ? AND ?
           AND i.status <> 'void'
         GROUP BY i.id
         ORDER BY i.issue_date DESC`,
        start,
        end,
    );
}

export interface FromWrikeOptions {
    start: string;
    end: string;
    customer_id: number;
    /** Omit to derive it the way the legacy script did: month + lastDay + year. */
    invoice_number?: string;
    /** Omit to use the first of the month containing `start`. */
    issue_date?: string;
    /** Omit to fall back to settings.default_net_days after the issue date. */
    due_date?: string;
    /** Skip timelogs already attached to a line item. Defaults to true. */
    skip_imported?: boolean;
}

/**
 * Build a draft invoice from cached timelogs in a range.
 *
 * Replaces get-wrike-time.js wholesale. Same date and numbering conventions, except
 * the due date is now a real normalized date rather than the ISO string the legacy
 * script emitted while writing every other date as MM-DD-YYYY.
 */
export function createInvoiceFromWrike(db: Db, options: FromWrikeOptions): InvoiceDetail {
    const skipImported = options.skip_imported ?? true;
    const logs = previewRange(db, options.start, options.end)
        .filter((log) => !(skipImported && log.already_imported));

    const issue_date = options.issue_date ?? monthBounds(options.start).start;
    const { default_net_days } = get<{ default_net_days: number }>(
        db,
        'SELECT default_net_days FROM settings WHERE id = 1',
    )!;

    return transaction(db, () => {
        const invoice = createInvoice(db, {
            invoice_number: options.invoice_number ?? suggestInvoiceNumber(issue_date),
            customer_id: options.customer_id,
            issue_date,
            due_date: options.due_date ?? addDays(issue_date, default_net_days),
            status: 'draft',
            line_items: logs.map((log) => ({
                work_date: log.tracked_date,
                description: log.comment,
                minutes: log.minutes,
                source: 'wrike' as const,
                wrike_timelog_id: log.id,
                wrike_task_id: log.task_id,
                wrike_hours_raw: log.hours_raw,
            })),
        });

        // Link the cached timelogs back to the line items they produced.
        for (const item of invoice.line_items) {
            if (item.wrike_timelog_id) {
                run(
                    db,
                    'UPDATE wrike_timelogs SET consumed_by_line_item_id = ? WHERE id = ?',
                    item.id,
                    item.wrike_timelog_id,
                );
            }
        }
        return invoice;
    });
}
