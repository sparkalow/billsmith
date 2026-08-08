/**
 * Typed fetch wrappers over the API. All shapes come from @shared/types, so a
 * server-side schema change surfaces here as a type error rather than at runtime.
 */

import type {
    InvoiceDetail,
    InvoiceListResponse,
    CreateInvoiceInput,
    UpdateInvoiceInput,
    LineItemInput,
    CustomerRow,
    SettingsRow,
} from '@shared/types.js';

export class ApiError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly details?: { path: string; message: string }[],
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
        response = await fetch(`/api${path}`, {
            headers: init?.body ? { 'Content-Type': 'application/json' } : {},
            ...init,
        });
    } catch (err) {
        throw new ApiError(
            `Cannot reach the API server. Is it running on port 3000? (${(err as Error).message})`,
            0,
        );
    }

    if (response.status === 204) {return undefined as T;}

    const text = await response.text();
    const payload = text ? (JSON.parse(text) as unknown) : undefined;

    if (!response.ok) {
        const body = payload as { error?: string; details?: { path: string; message: string }[] };
        throw new ApiError(body?.error ?? response.statusText, response.status, body?.details);
    }
    return payload as T;
}

// Invoices -----------------------------------------------------------

export const listInvoices = () => request<InvoiceListResponse>('/invoices');

export const getInvoice = (id: number) => request<InvoiceDetail>(`/invoices/${id}`);

export const createInvoice = (input: CreateInvoiceInput) =>
    request<InvoiceDetail>('/invoices', { method: 'POST', body: JSON.stringify(input) });

export const updateInvoice = (id: number, patch: UpdateInvoiceInput) =>
    request<InvoiceDetail>(`/invoices/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });

export const deleteInvoice = (id: number) =>
    request<void>(`/invoices/${id}`, { method: 'DELETE' });

export const putLineItems = (id: number, line_items: LineItemInput[]) =>
    request<InvoiceDetail>(`/invoices/${id}/line-items`, {
        method: 'PUT',
        body: JSON.stringify({ line_items }),
    });

export const suggestInvoiceNumber = (issue_date: string) =>
    request<{ invoice_number: string }>(
        `/invoice-number/suggest?issue_date=${encodeURIComponent(issue_date)}`,
    );

// Customers and settings ---------------------------------------------

export const listCustomers = () => request<CustomerRow[]>('/customers');

export const createCustomer = (input: { name: string; address_1?: string; address_2?: string }) =>
    request<CustomerRow>('/customers', { method: 'POST', body: JSON.stringify(input) });

export const updateCustomer = (id: number, patch: Partial<CustomerRow>) =>
    request<CustomerRow>(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });

export const getSettings = () => request<SettingsRow>('/settings');

export const updateSettings = (patch: Partial<SettingsRow>) =>
    request<SettingsRow>('/settings', { method: 'PUT', body: JSON.stringify(patch) });
