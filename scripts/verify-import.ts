#!/usr/bin/env tsx
/**
 * Verify the SQLite import against the legacy 11ty build.
 *
 *   npx @11ty/eleventy          # in the legacy repo, to refresh _site/
 *   npm run db:verify -- ../_site
 *
 * This is the gate before any UI work. It compares, per invoice, the rendered
 * Balance Due / Sub Total / Total Hours / line-item count from _site against what
 * the invoice_totals view computes, plus the cumulative figure from the index page.
 *
 * Invoices are matched on issue_date, which is unique across all 19 and is rendered
 * on every page. Matching on invoice_number would not work: the legacy build renders
 * dec-2025 and jan-2026 with the *same* number, because YAML silently drops the
 * leading zero from 01012026. That divergence is expected and is reported, not
 * treated as a failure — the import preserves the true literal.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { openDb, defaultDbPath } from '../server/src/db/index.js';
import { formatUSD, formatHM } from '../shared/duration.js';
import { normalizeDate } from '../shared/dates.js';

interface Rendered {
    slug: string;
    issue_date: string;
    invoice_number: string;
    total_hours: string;
    hourly_rate: string;
    sub_total: string;
    balance_due: string;
    line_item_count: number;
}

const pick = (html: string, re: RegExp): string | null => re.exec(html)?.[1]?.trim() ?? null;

function parseRendered(dir: string, slug: string): Rendered | null {
    const file = join(dir, slug, 'index.html');
    if (!existsSync(file)) return null;
    const html = readFileSync(file, 'utf8');

    const date = pick(html, /class="invoice-date">Date:\s*([^<]+)</);
    const number = pick(html, /class="invoice-number">Invoice No\.\s*([^<]*)</);
    const hours = pick(html, /<label>Total Hours<\/label><span>([^<]*)</);
    const rate = pick(html, /<label>Hourly Rate<\/label><span>([^<]*)</);
    const sub = pick(html, /<label>Sub Total<\/label><span>([^<]*)</);
    const due = pick(html, /class="balance-due">([^<]*)<\/span>/);
    const items = html.match(/class="invoice-item invoice-grid"/g)?.length ?? 0;

    if (!date || !hours || !sub || !due) return null;

    // Stale _site directories linger for invoices long since deleted from src/, and
    // some of them rendered a raw JS Date. An unparseable date means "not a current
    // invoice page", so skip it rather than failing the run.
    let issue_date: string;
    try {
        issue_date = normalizeDate(date, `${slug} rendered date`);
    } catch {
        return null;
    }

    return {
        slug,
        issue_date,
        invoice_number: number ?? '',
        total_hours: hours,
        hourly_rate: rate ?? '',
        sub_total: sub,
        balance_due: due,
        line_item_count: items,
    };
}

function main(): void {
    const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
    const siteDir = resolve(positional[0] ?? '../_site');
    const sourceDir = resolve(positional[1] ?? '../src/invoices');
    const invoicesDir = join(siteDir, 'invoices');

    if (!existsSync(invoicesDir)) {
        console.error(`No legacy build at ${invoicesDir}. Run \`npx @11ty/eleventy\` in the legacy repo first.`);
        process.exit(1);
    }
    if (!existsSync(sourceDir)) {
        console.error(`No legacy source at ${sourceDir}.`);
        process.exit(1);
    }

    // _site is not a reliable listing of current invoices: it retains directories for
    // invoices long since deleted from src/ (jan-2099, test, 2026-01-01-45342, ...).
    // One of those stale pages even collides on issue_date with a live invoice, so
    // filter by what actually still has a source file.
    const liveSlugs = new Set(
        readdirSync(sourceDir)
            .filter((f) => f.endsWith('.md'))
            .map((f) => f.replace(/\.md$/, '')),
    );

    const rendered = readdirSync(invoicesDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && liveSlugs.has(d.name))
        .map((d) => parseRendered(invoicesDir, d.name))
        .filter((r): r is Rendered => r !== null);

    const db = openDb(defaultDbPath());
    const rows = db
        .prepare(
            `SELECT i.id, i.invoice_number, i.issue_date, i.hourly_rate_cents,
                    t.total_minutes, t.subtotal_cents, t.tax_cents, t.total_cents,
                    t.line_item_count
             FROM invoices i
             JOIN invoice_totals t ON t.invoice_id = i.id`,
        )
        .all() as {
            id: number; invoice_number: string; issue_date: string; hourly_rate_cents: number;
            total_minutes: number; subtotal_cents: number; tax_cents: number;
            total_cents: number; line_item_count: number;
        }[];

    const byDate = new Map(rows.map((r) => [r.issue_date, r]));

    const failures: string[] = [];
    const notes: string[] = [];
    let compared = 0;

    for (const page of rendered) {
        const row = byDate.get(page.issue_date);
        if (!row) {
            // A stale _site directory for an invoice no longer in src/ is not a failure.
            notes.push(`${page.slug}: rendered page has no DB counterpart (stale build artifact?)`);
            continue;
        }
        compared++;
        const check = (label: string, expected: string, actual: string) => {
            if (expected !== actual) {
                failures.push(`${page.slug}: ${label} — legacy "${expected}", db "${actual}"`);
            }
        };

        check('Balance Due', page.balance_due, formatUSD(row.total_cents));
        check('Sub Total', page.sub_total, formatUSD(row.subtotal_cents));
        check('Total Hours', page.total_hours, formatHM(row.total_minutes));
        check('Hourly Rate', page.hourly_rate, formatUSD(row.hourly_rate_cents));
        if (page.line_item_count !== row.line_item_count) {
            failures.push(
                `${page.slug}: line item count — legacy ${page.line_item_count}, db ${row.line_item_count}`,
            );
        }
        if (page.invoice_number !== row.invoice_number) {
            notes.push(
                `${page.slug}: invoice_number — legacy rendered "${page.invoice_number}", ` +
                `db preserves "${row.invoice_number}"`,
            );
        }
    }

    // Cumulative figure from the legacy index page.
    const indexHtml = existsSync(join(siteDir, 'index.html'))
        ? readFileSync(join(siteDir, 'index.html'), 'utf8')
        : '';
    const legacyCumulative = pick(indexHtml, /class="lifetime-total">\s*Cumulative total\s*-\s*([^<]+)</);
    const dbCumulative = db
        .prepare(`SELECT COALESCE(SUM(t.total_cents), 0) AS c
                  FROM invoice_totals t
                  JOIN invoices i ON i.id = t.invoice_id
                  WHERE i.status <> 'void'`)
        .get() as { c: number };

    if (legacyCumulative && legacyCumulative !== formatUSD(dbCumulative.c)) {
        failures.push(`cumulative total — legacy "${legacyCumulative}", db "${formatUSD(dbCumulative.c)}"`);
    }

    // Report.
    console.log(`Compared ${compared} invoice(s) against ${siteDir}`);
    console.log(`  invoices in db:     ${rows.length}`);
    console.log(`  line items in db:   ${rows.reduce((s, r) => s + r.line_item_count, 0)}`);
    console.log(`  cumulative (db):    ${formatUSD(dbCumulative.c)}`);
    console.log(`  cumulative (11ty):  ${legacyCumulative ?? 'n/a'}`);

    if (notes.length) {
        console.log(`\nExpected divergences (${notes.length}):`);
        for (const n of notes) console.log(`  - ${n}`);
    }

    if (failures.length) {
        console.error(`\nFAILED — ${failures.length} mismatch(es):`);
        for (const f of failures) console.error(`  ${f}`);
        db.close();
        process.exit(1);
    }

    if (compared === 0) {
        console.error('\nFAILED — nothing was actually compared.');
        db.close();
        process.exit(1);
    }
    // Every imported invoice must have been checked against a rendered page.
    // Without this, an invoice dropped by the importer would pass silently.
    if (compared !== rows.length) {
        console.error(
            `\nFAILED — compared ${compared} page(s) but the database holds ${rows.length} invoice(s). ` +
            `Every invoice must be verified.`,
        );
        db.close();
        process.exit(1);
    }

    console.log(`\nPASS — all ${compared} invoices match the legacy build.`);
    db.close();
}

main();
