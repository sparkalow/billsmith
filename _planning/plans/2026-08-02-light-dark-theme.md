# Light/Dark Theme with Toggle

**Date:** 2026-08-02

## Objective

Give the UI a real light/dark theme with a user-facing Light/Dark/System toggle, on top of a colour-variable naming convention that survives a palette change. The printable invoice must be provably unaffected.

Before this change the app had an accidental, partial dark mode: `color-scheme: light dark` plus seven scattered `light-dark()` calls. `body` never set a text colour, ~39 hardcoded colours in `app.css` were light-mode-only, and the `:root` token block lived in the print-critical `invoice.css` — so any dark-mode redefinition of `--text-color-dark` / `--text-light-color` would have changed the printed invoice.

## Approach

Three token layers, in `client/src/assets/tokens.css`:

| Layer | Prefix | Role |
|---|---|---|
| 1 | `--palette-*` | Nine raw anchors: three neutrals (lightest/mid/darkest) + six hues. The only block to edit when the palette changes. |
| 2 | `--ui-*` | Role-named, theme-aware. Intermediate shades derived via `color-mix(in oklab, …)` against the mid anchor. Application CSS consumes only these. |
| 3 | `--doc-*` | The invoice. Frozen literals — no `light-dark()`, no theming, ever. |

Theming switches `color-scheme` on `:root`; every `--ui-*` value is a `light-dark()` pair, so one property flips the whole UI with no second block to keep in sync.

## Implementation Steps

- [x] Create `client/src/assets/tokens.css` with the three layers; move `:root` out of `invoice.css` (font-face rules stay).
- [x] Import `tokens.css` first in `client/src/main.ts`.
- [x] Retire the seven old colour variables across all 61 call sites — `app.css`, `invoice.css`, and `SettingsView.vue:155`.
- [x] `app.css`: convert every hardcoded literal to a `--ui-*` token; collapse the inline `light-dark()` calls now that the pairs live in the tokens.
- [x] Fix `.list-head`, which used the near-white nav foreground as text on the page background (invisible in light mode). Now `--ui-text-muted`.
- [x] `invoice.css`: document colours to `--doc-*`; `body` to `--ui-surface-page` + **add `color: var(--ui-text-primary)`** (previously unset — the root cause of dark mode never working).
- [x] Create `client/src/composables/useTheme.ts` — module-level ref, `localStorage['billsmith:theme']`, `'system'` = absence of the `data-theme` attribute.
- [x] Add the pre-paint inline script to `client/index.html` to avoid a flash of the wrong theme.
- [x] Create `client/src/components/ThemeToggle.vue` (inline SVG icons, no new dependency) and mount it in the nav in `App.vue`.
- [x] Swap the wordmark's hardcoded white fills to `currentColor` so it tracks `--ui-text-on-nav`.
- [x] Verify every foreground/background pairing against WCAG.

## Deviations from the original plan

The plan flagged that the `color-mix()` percentages were starting points needing a contrast pass. That pass found six real failures, all fixed:

1. **`--ui-border`** — 2.05:1 light, 1.32:1 dark; needs 3:1 (WCAG 1.4.11) since it carries input outlines. No mix between the darkest and mid anchors can reach 3:1 against dark surfaces, so the dark border is now the **mid anchor itself** (3.03–3.40:1) and the light border is `mix(lightest 15%, mid)` (3.52–3.93:1). Both are heavier than the old `#aaa`.
2. **`--ui-accent-text`** — white on the magenta accent is only 3.23:1. Now the **dark** anchor (5.59:1). Commented, because it must be rechecked if the accent ever becomes a dark colour.
3. **`.btn` foreground** — the original plan folded the button label into `--ui-accent-text`, but `.btn`'s base sits on the *nav* surface and only its hover state sits on the accent. Split: base uses `--ui-text-on-nav`, `.btn:hover` sets `--ui-accent-text` explicitly, and `.btn-danger:hover` overrides it back.
4. **`badge.paid` / `badge.sent`** — white was 2.96:1 and 3.63:1. The hues are now darkened at the *token* layer (`75%` / `85%` toward the dark anchor), keeping the palette entries as pure brand hues.
5. **`.badge` fallback** — used `--ui-border` as a fill (4.18:1). Now uses the neutral "void" pair (5.30:1).
6. **`alert-warn` light** — 3.78:1. All three alert foregrounds retuned from `70%` to `60%` toward the dark anchor.

Also added `--ui-surface-hover` (a hover fill for transparent controls on the page) because `.btn-secondary:hover` had been filling with `--ui-border`, which is now too dark to carry label text.

## Verification

- [x] `npm run typecheck` — clean.
- [x] `npm run build` — clean; `color-mix()` and `light-dark()` survive the build unmangled.
- [x] `grep -rn "var(--text-\|var(--brand-" client/src` returns nothing; `light-dark()` appears only in `tokens.css`.
- [x] The compiled `@media print` block references **only** `--doc-ink`, `--doc-panel`, `--doc-paper`, `--doc-totals` — no `--ui-*` token can reach print output.
- [x] All 44 foreground/background pairings clear WCAG AA (4.5:1 text, 3:1 non-text) in both themes.
- [ ] **Browser pass still outstanding** — the Chrome extension was not connected. See STATUS.md.
