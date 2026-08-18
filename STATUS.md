# Status

## Current work

**Reports route added (2026-08-11) — code complete, numbers verified, awaiting a browser pass.**
Plan: `_planning/plans/2026-08-11-reports-route.md`

`/reports` with three tabbed sub-routes — `/reports/yearly`, `/reports/outstanding`,
`/reports/customers` — served from a single `GET /api/reports`. Aggregates are SQL over the
`invoice_totals` view in `server/src/db/queries/reports.ts`, never recomputed in JS.

The status vocabulary is uniform across all three reports and is the thing to preserve if
these queries are ever edited:

| Term | Definition |
|---|---|
| Billed | `status IN ('sent','paid')` |
| Collected | `status = 'paid'` |
| Outstanding | `status = 'sent'` |
| Draft | `status = 'draft'` — never inside Billed |
| Void | excluded everywhere |

Two derived facts worth remembering: there is **no `overdue` status** in the schema, so age
comes from `due_date` against `date('now')` (UTC, matching the `paid_date` auto-fill); and the
customer report groups on `customer_id`, not the invoice's snapshotted `customer_name`, so a
rename does not split a customer into two rows.

The old "Cumulative total" footer is gone, along with `cumulativeCents()`, the
`cumulative_cents` field on `GET /api/invoices`, and the store's `cumulativeCents` /
`unpaidCents`. Nothing was lost: the old lifetime figure equals Billed + Draft on the yearly
report — it had been folding drafts in silently, which is now split out.

Verified against `data/invoices.db`: per-status sums (draft 9917¢, paid 1234627¢, sent
146767¢) reconcile exactly with every report column, and the aging buckets match the three
open invoices. Typecheck, build and eslint all pass.

Not done — the Chrome extension was not connected, so this needs the same browser pass as the
theme work below:

- [ ] Nav shows Reports; `/reports` redirects to `/reports/yearly`; all three tabs render.
- [ ] Switching tabs does **not** refire the fetch (`ensureLoaded` guard) — check the Network panel.
- [ ] Light, dark and system themes; the `.report-tabs` strip is `no-print`.

**Open-source release prep — Wrike integration removed. Done, fully verified.**
Plan: `_planning/plans/2026-08-05-remove-wrike-integration.md` (local only — `_planning/`
is gitignored)

The Wrike client, routes, queries, import screen, `/import` route, settings field, env
vars and schema (`wrike_timelogs`, `line_items.wrike_*`, `settings.wrike_contact_id`) are
gone. `LineItemSource` is now `'manual' | 'import'`. `001_init.sql` was rewritten rather
than superseded, and a one-off `strip-wrike.ts` brought `data/invoices.db` into line
before being deleted — 20 invoices / 279 line items / totals identical before and after,
backup at `data/backups/pre-strip-wrike.db`. Typecheck, build, a fresh migrate and the
browser pass all pass.

Publication is planned from a **fresh repository**, so the current git history is
disposable and the old Wrike token needs no rotation.

**Seed defaults neutralised (2026-08-06).** `DEFAULT_BUSINESS` and `DEFAULT_CUSTOMER` in
`server/src/db/seed.ts` are now placeholders (`First Last`, `123 Main St`,
`City ST, 90210`). `DEFAULT_TERMS_HTML` and the 8500¢ rate are generic and stayed as-is.
Seeding is `ON CONFLICT DO NOTHING`, so existing databases keep their real values.

**Markdown import scripts removed (2026-08-06).** `scripts/import-markdown.ts` and
`scripts/verify-import.ts` are gone, along with their `db:import` / `db:verify` npm
scripts and the `js-yaml` + `@types/js-yaml` devDependencies (nothing else used them).
`scripts/` is now just `migrate.ts`.

Their removal orphaned two exports in `shared/dates.ts`, both deleted: `normalizeDate`
(with its five-legacy-format disambiguation block, `isRealDate`, and the `YEAR_FIRST` /
`MONTH_FIRST` patterns) and `monthBounds`, which had already gone unused when the Wrike
range picker went. The remaining formatters are all live.

`LineItemSource` keeps `'import'` — 277 existing line items carry it, and the value is a
truthful provenance record even with the importer gone.

**`_planning/` untracked (2026-08-06).** Plans stay on disk and the CLAUDE.md convention
still applies — they just no longer ship. `.gitignore` covers the whole directory.

No known release-prep items remain open.

**Light/dark theme — code complete, awaiting a browser pass.**
Plan: `_planning/plans/2026-08-02-light-dark-theme.md` (local only — `_planning/` is
gitignored)

Typecheck, build, and a full WCAG contrast sweep all pass. What has *not* happened is looking at it in a real browser — the Chrome extension was not connected during the session. Run `npm run dev` and check:

- [ ] Toggle cycles System → Light → Dark; nav, cards, list rows, inputs, buttons, badges and all three alert variants read correctly in both themes.
- [ ] Reload in each state — no flash of the wrong theme (the pre-paint script in `index.html` handles this).
- [ ] In `system` mode, flipping the OS appearance setting follows live without a reload.
- [ ] **Print check:** open an invoice's print view in **dark** mode and compare the print preview against light mode. They must be identical. The compiled print block only references `--doc-*` tokens, so this should hold, but it is the one thing worth confirming by eye.
- [ ] Borders and muted text are the values most likely to want an aesthetic nudge — they were tuned to the WCAG minimum, not to taste.

## Theming notes

Colours live in `client/src/assets/tokens.css` in three layers:

- `--palette-*` — nine raw anchors. **This is the only block to edit when the palette changes.**
- `--ui-*` — role-named, theme-aware. Application CSS uses only these.
- `--doc-*` — the invoice document. Frozen literals; never theme these or the printed output changes.

Two things to recheck after any palette change:

1. `--ui-accent-text` is currently the *dark* anchor, because the accent is a bright magenta. A dark accent would need it flipped to lightest.
2. The nav is dark in both themes, which is what lets the wordmark inherit `--ui-text-on-nav`. A light nav would need that pairing revisited.

Theme preference is per-device in `localStorage['billsmith:theme']`, and is always `'light'` or `'dark'` — there is no user-selectable "system" state. Nothing is written to storage until the user toggles, so an untouched install keeps following `prefers-color-scheme`; either way `<html>` always carries a concrete `data-theme`.
