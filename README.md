# Billsmith - a DIY Invoice app for the technically minded

Vue 3 + TypeScript front end over a Fastify API and a SQLite database.

Invoices are created here, edited here, and printed from the browser to PDF.

This is intended to be ran locally as a personal app. It is not intended to be
deployed anywhere. There is no authentication.

## Running it

```bash
npm install
npm run db:migrate     # create/upgrade the database and seed defaults
npm run dev            # everything on http://localhost:3000
```

One process, one port. In development the Fastify server runs Vite in middleware
mode, so the client and the API share an origin — there is no proxy and no CORS, and
HMR works as normal. Production is the same server serving `client/dist`:

```bash
npm run build          # build the client into client/dist
npm start              # NODE_ENV=production, also on :3000
```

Fastify matches its own routes before Vite sees a request, so `/api/*` always resolves
to the API and everything else falls through to the client router.

## Configuration

Copy `server/.env.example` to `server/.env`:

| Variable           | Purpose                                                         |
|--------------------|-----------------------------------------------------------------|
| `WRIKE_TOKEN`      | Wrike permanent access token. Required for the import screen.   |
| `WRIKE_CONTACT_ID` | Wrike contact whose timelogs are billed. Also in Settings.      |
| `DB_PATH`          | Override the database location. Defaults to `data/invoices.db`. |
| `PORT` / `HOST`    | API server binding. Defaults to `127.0.0.1:3000`.               |
    
## The database

The SQLite file lives at `data/invoices.db` (gitignored, along with its `-wal` and
`-shm` companions).

**Back it up with `.backup`, not `cp`.** The database runs in WAL mode, so copying the
`.db` file alone while the server is running can capture a torn state:

This is the actual command. It looks weird.
```bash
sqlite3 data/invoices.db ".backup 'data/backups/billsmith-$(date +%F).db'"
```

Poke around directly whenever it is useful:

```bash
sqlite3 data/invoices.db \
  "SELECT i.invoice_number, i.issue_date, t.total_minutes, t.total_cents
   FROM invoices i JOIN invoice_totals t ON t.invoice_id = i.id
   ORDER BY i.issue_date DESC LIMIT 10;"
```

### Conventions

These hold everywhere — schema, API, and client:

- **Money is INTEGER cents.** No floats in money columns or money math.
- **Durations are INTEGER minutes.** `H:MM` is a display format only.
- **Dates are TEXT `YYYY-MM-DD`.** Sortable, comparable, unambiguous.
- **`invoice_number` is TEXT.** `01012026` has a significant leading zero.
- **Totals are derived**, never stored — see the `invoice_totals` view.
- **Business, customer, and terms are snapshotted onto each invoice** at creation, so
  changing your address next year does not rewrite what last year's invoice said.

### Migrations

SQL files in `server/src/db/migrations/`, applied in filename order, each in its own
transaction. Add `002_whatever.sql` and run `npm run db:migrate`.

## Layout

```
shared/     types and pure helpers used by both sides (durations, dates, money)
server/     Fastify API; db/index.ts is the only file that touches the SQLite driver
            app.ts also hosts Vite in dev and serves client/dist in production
client/     Vue 3 SPA; InvoiceDocument.vue is shared by the print view and the editor
            vite.config.ts has no `server` block — Vite never runs standalone
scripts/    migrate, one-time markdown import, import verification
```

`server`'s dev script scopes `tsx watch` away from `client/` and `.vite-temp/`. Vite
writes a short-lived temp file when it loads its TypeScript config; without those
ignores the watcher sees it disappear, restarts, and loops forever.