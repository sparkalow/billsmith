-- Initial schema for the invoice app.
--
-- Conventions:
--   money     -> INTEGER cents
--   durations -> INTEGER minutes (H:MM is display only)
--   dates     -> TEXT 'YYYY-MM-DD'
--   invoice_number is TEXT, never INTEGER: '01012026' has a significant leading zero.

-- Single-row app config: the "pay to" identity and current defaults.
CREATE TABLE settings (
    id                  INTEGER PRIMARY KEY CHECK (id = 1),
    business_name       TEXT    NOT NULL,
    business_address_1  TEXT    NOT NULL,
    business_address_2  TEXT    NOT NULL,
    default_terms_html  TEXT    NOT NULL,
    default_rate_cents  INTEGER NOT NULL DEFAULT 8500,
    default_net_days    INTEGER NOT NULL DEFAULT 30,
    updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE customers (
    id                 INTEGER PRIMARY KEY,
    name               TEXT    NOT NULL,
    address_1          TEXT    NOT NULL DEFAULT '',
    address_2          TEXT    NOT NULL DEFAULT '',
    default_rate_cents INTEGER,          -- NULL falls back to settings.default_rate_cents
    archived           INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
    created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE invoices (
    id                INTEGER PRIMARY KEY,
    invoice_number    TEXT    NOT NULL UNIQUE,
    customer_id       INTEGER NOT NULL REFERENCES customers(id),

    status            TEXT    NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft', 'sent', 'paid', 'void')),
    issue_date        TEXT    NOT NULL CHECK (issue_date LIKE '____-__-__'),
    due_date          TEXT    NOT NULL CHECK (due_date LIKE '____-__-__'),
    paid_date         TEXT    CHECK (paid_date IS NULL OR paid_date LIKE '____-__-__'),

    hourly_rate_cents INTEGER NOT NULL CHECK (hourly_rate_cents >= 0),
    tax_rate          REAL    NOT NULL DEFAULT 0 CHECK (tax_rate >= 0),

    -- Snapshots: what this invoice said when it was issued. Changing your address
    -- next year must not silently rewrite what a 2025 invoice claimed.
    customer_name      TEXT NOT NULL,
    customer_address_1 TEXT NOT NULL,
    customer_address_2 TEXT NOT NULL,
    business_name      TEXT NOT NULL,
    business_address_1 TEXT NOT NULL,
    business_address_2 TEXT NOT NULL,
    terms_html         TEXT NOT NULL,

    notes             TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_invoices_issue_date ON invoices (issue_date DESC);
CREATE INDEX idx_invoices_customer   ON invoices (customer_id);
CREATE INDEX idx_invoices_status     ON invoices (status);

CREATE TABLE line_items (
    id          INTEGER PRIMARY KEY,
    invoice_id  INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    work_date   TEXT    NOT NULL CHECK (work_date LIKE '____-__-__'),
    description TEXT    NOT NULL,
    minutes     INTEGER NOT NULL CHECK (minutes >= 0),

    source      TEXT    NOT NULL DEFAULT 'manual'
                    CHECK (source IN ('manual', 'import')),

    UNIQUE (invoice_id, position)
);

CREATE INDEX idx_line_items_invoice ON line_items (invoice_id, position);

-- Totals stay derived, never stored — but computed once in SQL rather than
-- recomputed per render as the legacy getTotals filter did.
--
-- The LEFT JOIN is load-bearing: it makes a zero-line-item invoice total 0
-- instead of crashing, which the legacy filter did not survive.
CREATE VIEW invoice_totals AS
SELECT
    i.id AS invoice_id,
    COALESCE(SUM(li.minutes), 0) AS total_minutes,
    CAST(ROUND(COALESCE(SUM(li.minutes), 0) * i.hourly_rate_cents / 60.0) AS INTEGER)
        AS subtotal_cents,
    CAST(ROUND(
        ROUND(COALESCE(SUM(li.minutes), 0) * i.hourly_rate_cents / 60.0) * i.tax_rate
    ) AS INTEGER) AS tax_cents,
    CAST(ROUND(COALESCE(SUM(li.minutes), 0) * i.hourly_rate_cents / 60.0) AS INTEGER)
      + CAST(ROUND(
            ROUND(COALESCE(SUM(li.minutes), 0) * i.hourly_rate_cents / 60.0) * i.tax_rate
        ) AS INTEGER) AS total_cents,
    COUNT(li.id) AS line_item_count
FROM invoices i
LEFT JOIN line_items li ON li.invoice_id = i.id
GROUP BY i.id;

-- Keep updated_at honest without requiring every caller to remember it.
CREATE TRIGGER invoices_touch_updated_at
AFTER UPDATE ON invoices
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE invoices SET updated_at = datetime('now') WHERE id = NEW.id;
END;
