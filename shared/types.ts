/**
 * Shared domain types, mirroring 001_init.sql. Imported by both server and client.
 *
 * Row types match the database exactly (snake_case, INTEGER booleans). The DTOs the
 * API actually returns are assembled from them below.
 */

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'void';
export type LineItemSource = 'manual' | 'import';

export interface SettingsRow {
    id: 1;
    business_name: string;
    business_address_1: string;
    business_address_2: string;
    default_terms_html: string;
    default_rate_cents: number;
    default_net_days: number;
    updated_at: string;
}

export interface CustomerRow {
    id: number;
    name: string;
    address_1: string;
    address_2: string;
    default_rate_cents: number | null;
    archived: 0 | 1;
    created_at: string;
}

export interface InvoiceRow {
    id: number;
    invoice_number: string;
    customer_id: number;
    status: InvoiceStatus;
    issue_date: string;
    due_date: string;
    paid_date: string | null;
    hourly_rate_cents: number;
    tax_rate: number;
    customer_name: string;
    customer_address_1: string;
    customer_address_2: string;
    business_name: string;
    business_address_1: string;
    business_address_2: string;
    terms_html: string;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

export interface LineItemRow {
    id: number;
    invoice_id: number;
    position: number;
    work_date: string;
    description: string;
    minutes: number;
    source: LineItemSource;
}

/** Output of the `invoice_totals` view. All money in cents, time in whole minutes. */
export interface InvoiceTotals {
    invoice_id: number;
    total_minutes: number;
    subtotal_cents: number;
    tax_cents: number;
    total_cents: number;
    line_item_count: number;
}

// ---------------------------------------------------------------------------
// API payloads
// ---------------------------------------------------------------------------

/** A row in the invoice list view. */
export interface InvoiceSummary extends InvoiceRow {
    totals: InvoiceTotals;
}

/** A full invoice, as rendered or edited. */
export interface InvoiceDetail extends InvoiceRow {
    line_items: LineItemRow[];
    totals: InvoiceTotals;
}

export interface InvoiceListResponse {
    invoices: InvoiceSummary[];
}

/** Line item as accepted by the API — no id, position is implied by array order. */
export interface LineItemInput {
    work_date: string;
    description: string;
    minutes: number;
    source?: LineItemSource;
}

export interface CreateInvoiceInput {
    invoice_number: string;
    customer_id: number;
    issue_date: string;
    due_date?: string;
    status?: InvoiceStatus;
    hourly_rate_cents?: number;
    tax_rate?: number;
    notes?: string | null;
    line_items?: LineItemInput[];
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

/**
 * Money split by status, shared by the yearly and per-customer reports.
 *
 * `void` invoices are excluded from every figure. `draft_cents` is deliberately
 * outside `billed_cents`: a draft has not been issued, so counting it as billed
 * overstates what is actually owed.
 */
export interface StatusTotals {
    /** Non-void invoices, drafts included — matches draft_cents being shown alongside. */
    invoice_count: number;
    total_minutes: number;
    /** status IN ('sent', 'paid') */
    billed_cents: number;
    /** status = 'paid' */
    collected_cents: number;
    /** status = 'sent' */
    outstanding_cents: number;
    /** status = 'draft' */
    draft_cents: number;
}

export interface YearlyTotalsRow extends StatusTotals {
    /** Calendar year of issue_date, as the four-character prefix. */
    year: string;
}

export interface CustomerTotalsRow extends StatusTotals {
    customer_id: number;
    /** Current name from `customers`, falling back to the invoice snapshot. */
    customer_name: string;
}

/** One unpaid (status = 'sent') invoice, with its age relative to today. */
export interface OutstandingInvoiceRow {
    id: number;
    invoice_number: string;
    customer_name: string;
    issue_date: string;
    due_date: string;
    total_cents: number;
    /** Days past due_date. Zero or negative means not yet due. */
    days_overdue: number;
}

/** Outstanding money bucketed by age. Keys are cent totals. */
export interface AgingBuckets {
    /** Not yet due. */
    current: number;
    d1_30: number;
    d31_60: number;
    d61_90: number;
    d90_plus: number;
}

export interface OutstandingReport {
    invoices: OutstandingInvoiceRow[];
    buckets: AgingBuckets;
    total_cents: number;
}

export interface ReportsResponse {
    yearly: YearlyTotalsRow[];
    outstanding: OutstandingReport;
    customers: CustomerTotalsRow[];
}

export type UpdateInvoiceInput = Partial<
    Pick<
        InvoiceRow,
        | 'invoice_number'
        | 'customer_id'
        | 'status'
        | 'issue_date'
        | 'due_date'
        | 'paid_date'
        | 'hourly_rate_cents'
        | 'tax_rate'
        | 'customer_name'
        | 'customer_address_1'
        | 'customer_address_2'
        | 'business_name'
        | 'business_address_1'
        | 'business_address_2'
        | 'terms_html'
        | 'notes'
    >
>;
