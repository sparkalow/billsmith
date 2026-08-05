import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

import * as api from '@/api/client';
import type { InvoiceSummary, InvoiceDetail } from '@shared/types.js';

export const useInvoiceStore = defineStore('invoices', () => {
    const invoices = ref<InvoiceSummary[]>([]);
    const cumulativeCents = ref(0);
    const loading = ref(false);
    const error = ref<string | null>(null);

    /** Newest first, matching the legacy listing order. */
    const sorted = computed(() =>
        [...invoices.value].sort((a, b) => b.issue_date.localeCompare(a.issue_date)),
    );

    const unpaidCents = computed(() =>
        invoices.value
            .filter((i) => i.status === 'sent')
            .reduce((sum, i) => sum + i.totals.total_cents, 0),
    );

    async function load(): Promise<void> {
        loading.value = true;
        error.value = null;
        try {
            const response = await api.listInvoices();
            invoices.value = response.invoices;
            cumulativeCents.value = response.cumulative_cents;
        } catch (err) {
            error.value = (err as Error).message;
        } finally {
            loading.value = false;
        }
    }

    /** Reload after any mutation so the list and its cumulative total stay honest. */
    async function refreshAfter<T>(action: () => Promise<T>): Promise<T> {
        const result = await action();
        await load();
        return result;
    }

    const create = (input: Parameters<typeof api.createInvoice>[0]) =>
        refreshAfter(() => api.createInvoice(input));

    const update = (id: number, patch: Parameters<typeof api.updateInvoice>[1]) =>
        refreshAfter(() => api.updateInvoice(id, patch));

    const remove = (id: number) => refreshAfter(() => api.deleteInvoice(id));

    const saveLineItems = (id: number, items: Parameters<typeof api.putLineItems>[1]) =>
        refreshAfter(() => api.putLineItems(id, items));

    async function fetchOne(id: number): Promise<InvoiceDetail> {
        return api.getInvoice(id);
    }

    return {
        invoices, cumulativeCents, loading, error,
        sorted, unpaidCents,
        load, create, update, remove, saveLineItems, fetchOne,
    };
});
