#!/usr/bin/env tsx
/**
 * One-time import of the legacy 11ty invoices into SQLite.
 *
 *   npm run db:import -- ../src/invoices
 *   npm run db:import -- ../src/invoices --force   # wipe existing invoices first
 *
 * This is the only point at which the new app reads the old repo. It is deliberately
 * strict: every date must match a known format and every duration must be well-formed,
 * or the whole import aborts with a report. Silently transposing a month and a day is
 * far worse than failing.
 *
 * One hazard is load-bearing here. `invoice_number: 01012026` (dec-2025.md) parses
 * through YAML to the *number* 1012026 — the leading zero is dropped — which collides
 * with jan-2026.md's genuine 1012026. Reading the number from the parsed object would
 * silently merge two distinct invoices. So invoice_number is pulled from the raw
 * frontmatter text instead, preserving the literal.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import yaml from 'js-yaml';

import { openDb, migrate, transaction, defaultDbPath } from '../server/src/db/index.js';
import { seed } from '../server/src/db/seed.js';
import { normalizeDate } from '../shared/dates.js';
import { parseHM, parseUSD } from '../shared/duration.js';

interface RawLineItem {
    date?: unknown;
    name?: unknown;
    hours?: unknown;
}

interface RawInvoice {
    customer?: { name?: string; address_line_1?: string; address_line_2?: string };
    paid?: boolean;
    invoice_number?: unknown;
    invoice_date?: unknown;
    invoice_due_date?: unknown;
    hourly_rate?: unknown;
    tax_rate?: unknown;
    line_items?: RawLineItem[];
}

interface ParsedInvoice {
    file: string;
    invoice_number: string;
    issue_date: string;
    due_date: string;
    status: 'paid' | 'sent';
    hourly_rate_cents: number;
    tax_rate: number;
    customer: { name: string; address_1: string; address_2: string };
    line_items: { work_date: string; description: string; minutes: number }[];
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;
/** Matches the literal text of the invoice_number line, quotes optional. */
const RAW_NUMBER = /^invoice_number:\s*(?:'([^']*)'|"([^"]*)"|(\S+))\s*$/m;

function parseFile(path: string, errors: string[]): ParsedInvoice | null {
    const file = basename(path);
    const raw = readFileSync(path, 'utf8');

    const fm = FRONTMATTER.exec(raw);
    if (!fm?.[1]) {
        errors.push(`${file}: no frontmatter block`);
        return null;
    }
    const block = fm[1];

    let data: RawInvoice;
    try {
        data = yaml.load(block) as RawInvoice;
    } catch (err) {
        errors.push(`${file}: YAML parse failed — ${(err as Error).message}`);
        return null;
    }
    if (!data || typeof data !== 'object') {
        errors.push(`${file}: frontmatter is not a mapping`);
        return null;
    }

    // Read the literal, not the YAML-coerced value. See the header note.
    const numberMatch = RAW_NUMBER.exec(block);
    const invoice_number = numberMatch
        ? (numberMatch[1] ?? numberMatch[2] ?? numberMatch[3] ?? '').trim()
        : '';
    if (!invoice_number) {
        errors.push(`${file}: missing or unreadable invoice_number`);
        return null;
    }

    const fail = (msg: string) => {
        errors.push(`${file}: ${msg}`);
        return null;
    };

    let issue_date: string;
    let due_date: string;
    try {
        issue_date = normalizeDate(data.invoice_date as string, `${file} invoice_date`);
    } catch (err) {
        return fail((err as Error).message);
    }
    try {
        due_date = data.invoice_due_date
            ? normalizeDate(data.invoice_due_date as string, `${file} invoice_due_date`)
            : issue_date;
    } catch (err) {
        return fail((err as Error).message);
    }

    let hourly_rate_cents: number;
    try {
        hourly_rate_cents = parseUSD(data.hourly_rate as string | number);
    } catch {
        return fail(`unreadable hourly_rate ${JSON.stringify(data.hourly_rate)}`);
    }
    if (!Number.isFinite(hourly_rate_cents) || hourly_rate_cents < 0) {
        return fail(`invalid hourly_rate ${JSON.stringify(data.hourly_rate)}`);
    }

    const line_items: ParsedInvoice['line_items'] = [];
    const rawItems = Array.isArray(data.line_items) ? data.line_items : [];
    rawItems.forEach((item, index) => {
        const where = `line_items[${index}]`;
        let work_date: string;
        try {
            work_date = normalizeDate(item.date as string, `${file} ${where}.date`);
        } catch (err) {
            errors.push(`${file}: ${(err as Error).message}`);
            return;
        }
        let minutes: number;
        try {
            minutes = parseHM(String(item.hours));
        } catch {
            errors.push(`${file}: ${where}.hours is ${JSON.stringify(item.hours)}`);
            return;
        }
        // Folded YAML scalars arrive with embedded newlines; collapse to one line.
        const description = String(item.name ?? '').replace(/\s+/g, ' ').trim();
        if (!description) {
            errors.push(`${file}: ${where}.name is empty`);
            return;
        }
        line_items.push({ work_date, description, minutes });
    });

    return {
        file,
        invoice_number,
        issue_date,
        due_date,
        status: data.paid === true ? 'paid' : 'sent',
        hourly_rate_cents,
        tax_rate: typeof data.tax_rate === 'number' ? data.tax_rate : 0,
        customer: {
            name: data.customer?.name?.trim() || 'Unknown',
            address_1: data.customer?.address_line_1?.trim() ?? '',
            address_2: data.customer?.address_line_2?.trim() ?? '',
        },
        line_items,
    };
}

function main(): void {
    const args = process.argv.slice(2);
    const force = args.includes('--force');
    const sourceArg = args.find((a) => !a.startsWith('--'));
    const sourceDir = resolve(sourceArg ?? '../src/invoices');

    console.log(`Importing from ${sourceDir}`);

    let files: string[];
    try {
        files = readdirSync(sourceDir).filter((f) => f.endsWith('.md')).sort();
    } catch {
        console.error(`Cannot read source directory ${sourceDir}`);
        process.exit(1);
    }
    if (files.length === 0) {
        console.error(`No .md files in ${sourceDir}`);
        process.exit(1);
    }

    // Parse everything before touching the database, so errors are reported together.
    const errors: string[] = [];
    const parsed = files
        .map((f) => parseFile(join(sourceDir, f), errors))
        .filter((p): p is ParsedInvoice => p !== null);

    const seenNumbers = new Map<string, string>();
    for (const inv of parsed) {
        const prior = seenNumbers.get(inv.invoice_number);
        if (prior) {
            errors.push(
                `duplicate invoice_number "${inv.invoice_number}" in ${prior} and ${inv.file}`,
            );
        }
        seenNumbers.set(inv.invoice_number, inv.file);
    }

    if (errors.length) {
        console.error(`\nAborting — ${errors.length} problem(s), nothing was written:\n`);
        for (const e of errors) console.error(`  ${e}`);
        process.exit(1);
    }

    const db = openDb(defaultDbPath());
    migrate(db);
    seed(db);

    const existing = db.prepare('SELECT COUNT(*) AS n FROM invoices').get() as { n: number };
    if (existing.n > 0 && !force) {
        console.error(
            `\nRefusing to import: ${existing.n} invoice(s) already present.\n` +
            `Re-run with --force to replace them.`,
        );
        db.close();
        process.exit(1);
    }

    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as {
        business_name: string;
        business_address_1: string;
        business_address_2: string;
        default_terms_html: string;
    };

    const totals = transaction(db, () => {
        if (force) db.exec('DELETE FROM invoices'); // line_items cascade

        const findCustomer = db.prepare('SELECT id FROM customers WHERE name = ?');
        const insertCustomer = db.prepare(
            'INSERT INTO customers (name, address_1, address_2) VALUES (?, ?, ?)',
        );
        const insertInvoice = db.prepare(
            `INSERT INTO invoices (
                invoice_number, customer_id, status, issue_date, due_date, paid_date,
                hourly_rate_cents, tax_rate,
                customer_name, customer_address_1, customer_address_2,
                business_name, business_address_1, business_address_2, terms_html
             ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        const insertItem = db.prepare(
            `INSERT INTO line_items (invoice_id, position, work_date, description, minutes, source)
             VALUES (?, ?, ?, ?, ?, 'import')`,
        );

        let invoiceCount = 0;
        let itemCount = 0;

        for (const inv of parsed) {
            let row = findCustomer.get(inv.customer.name) as { id: number } | undefined;
            if (!row) {
                insertCustomer.run(inv.customer.name, inv.customer.address_1, inv.customer.address_2);
                row = findCustomer.get(inv.customer.name) as { id: number };
            }

            const result = insertInvoice.run(
                inv.invoice_number,
                row.id,
                inv.status,
                inv.issue_date,
                inv.due_date,
                inv.hourly_rate_cents,
                inv.tax_rate,
                inv.customer.name,
                inv.customer.address_1,
                inv.customer.address_2,
                settings.business_name,
                settings.business_address_1,
                settings.business_address_2,
                settings.default_terms_html,
            );
            const invoiceId = Number(result.lastInsertRowid);

            inv.line_items.forEach((item, index) => {
                insertItem.run(invoiceId, index, item.work_date, item.description, item.minutes);
                itemCount++;
            });
            invoiceCount++;
        }
        return { invoiceCount, itemCount };
    });

    const cumulative = db
        .prepare(`SELECT COALESCE(SUM(t.total_cents), 0) AS c
                  FROM invoice_totals t
                  JOIN invoices i ON i.id = t.invoice_id
                  WHERE i.status <> 'void'`)
        .get() as { c: number };

    console.log(
        `\nImported ${totals.invoiceCount} invoices, ${totals.itemCount} line items.\n` +
        `Cumulative total: $${(cumulative.c / 100).toFixed(2)}`,
    );

    db.close();
}

main();
