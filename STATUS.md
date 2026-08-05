# Status

## Current work

**Light/dark theme — code complete, awaiting a browser pass.**
Plan: [`_planning/plans/2026-08-02-light-dark-theme.md`](_planning/plans/2026-08-02-light-dark-theme.md)

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

Theme preference is per-device in `localStorage['billsmith:theme']`; `'system'` is represented by the *absence* of the `data-theme` attribute on `<html>`.
