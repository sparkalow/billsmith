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
    /** Sum of total_cents across every non-void invoice. */
    cumulative_cents: number;
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
