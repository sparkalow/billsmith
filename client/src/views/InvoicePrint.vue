<script setup lang="ts">
/**
 * Single invoice, print-ready.
 * Everything except the document itself carries .app-chrome so it drops out in print.
 */

import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';

import { useInvoiceStore } from '@/stores/invoices';
import InvoiceDocument from '@/components/InvoiceDocument.vue';
import type { InvoiceDetail } from '@shared/types.js';

const route = useRoute();
const store = useInvoiceStore();

const invoice = ref<InvoiceDetail | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

onMounted(async () => {
    try {
        invoice.value = await store.fetchOne(Number(route.params.id));
    } catch (err) {
        error.value = (err as Error).message;
    } finally {
        loading.value = false;
    }
});

/** `window` is not in template scope, so printing goes through a method. */
function print(): void {
    window.print();
}

async function markPaid(): Promise<void> {
    if (!invoice.value) return;
    await store.update(invoice.value.id, { status: 'paid' });
    invoice.value = await store.fetchOne(invoice.value.id);
}
</script>

<template>
    <div>
        <div v-if="error" class="alert alert-error app-chrome">{{ error }}</div>
        <div v-if="loading" class="spinner app-chrome">Loading…</div>

        <template v-else-if="invoice">
            <div class="page-header app-chrome no-print" style="max-width: 60rem; margin: 0 auto 1rem">
                <RouterLink class="btn btn-secondary" to="/">← All invoices</RouterLink>
                <div style="display: flex; gap: .5rem">
                    <button
                        v-if="invoice.status !== 'paid'"
                        class="btn btn-secondary"
                        type="button"
                        @click="markPaid"
                    >
                        Mark paid
                    </button>
                    <RouterLink class="btn btn-secondary" :to="`/invoices/${invoice.id}/edit`">Edit</RouterLink>
                    <button class="btn" type="button" @click="print">Print / Save PDF</button>
                </div>
            </div>

            <InvoiceDocument :invoice="invoice" />
        </template>
    </div>
</template>
