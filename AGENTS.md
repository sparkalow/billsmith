# Billsmith - a DIY Invoice app for the technically minded
Vue 3 + TypeScript front end over a Fastify API and a SQLite database.

Invoices are created here, edited here, and printed from the browser to PDF.

## Project State Management
CLAUDE.md is for stable instructions only. Never store TODOs, changelogs, sprint status, session context, or completed work here.
- Reference state files instead (e.g., "See STATUS.md for current work").
- At session start, read both CLAUDE.md and STATUS.md.
- Update STATUS.md, not CLAUDE.md, when wrapping up significant work.
  
## Propose Before Executing
For anything larger than a single file edit, propose a plan and wait for approval:
- List files to create/modify.
- Note any dependencies to add.
- Flag ambiguous or guessed design decisions.

When exiting Plan Mode, save the plan to `_planning/plans/YYYY-MM-DD-descriptive-name.md` with: title, date, objective, and implementation steps as checkboxes (`- [ ]` / `- [x]`). Update checkboxes as steps complete.

## Git Conventions
- Use conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `style:`.
- Don't commit unless asked.

## Error Recovery
On failure, attempt one fix. If the second attempt fails, stop and explain what was tried, what's unknown, and what input would help (logs, console output, screenshots). Don't loop on the same failing approach.

## Code Quality & Style
- Run existing tests after changes; don't write new tests unless asked.
- Use ES modules (`import`/`export`), not CommonJS.
- Destructure imports where possible (e.g., `import { foo } from 'bar'`).
- Always use braces for all control statements (curly: ['error', 'all']). Run `npx eslint . --fix` before finishing.

## Dependencies
Surface any needed or simpler-alternative dependency for discussion. Do not add runtime dependencies without explicit approval.

## Testing Expectations
- Don't test trivial code (language features, getters/setters, generated code).
- Test intent and behavior — business logic, edge cases — not line coverage.
- Every test needs a meaningful assertion; don't just check a method "was called."
- Only mock external dependencies (APIs, databases), 
- Tests live next to source: `foo.ts` -> `foo.test.ts`.