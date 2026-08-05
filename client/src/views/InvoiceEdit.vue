<script setup lang="ts">
/**
 * Invoice editor. Replaces Sveltia CMS.
 *
 * Handles both create (/invoices/new) and edit (/invoices/:id). Totals update live
 * from the same arithmetic the server uses, so the preview never disagrees with what
 * gets stored.
 */

import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import * as api from '@/api/client';
import { useInvoiceStore } from '@/stores/invoices';
import { useSettingsStore } from '@/stores/settings';
import LineItemTable, { type EditableLineItem } from '@/components/LineItemTable.vue';
import InvoiceDocument from '@/components/InvoiceDocument.vue';
import type { InvoiceDetail, InvoiceStatus, InvoiceTotals, LineItemInput } from '@shared/types.js';
import { parseHM, formatUSD, amountCents, taxCents, parseUSD } from '@shared/duration.js';
import { addDays } from '@shared/dates.js';

const route = useRoute();
const router = useRouter();
const store = useInvoiceStore();
const settingsStore = useSettingsStore();

const isNew = computed(() => route.params.id === 'new' || route.path.endsWith('/new'));
const invoiceId = computed(() => (isNew.value ? null : Number(route.params.id)));

const loading = ref(true);
const saving = ref(false);
const error = ref<string | null>(null);
const showPreview = ref(true);

const invoice = ref<InvoiceDetail | null>(null);
const items = ref<EditableLineItem[]>([]);

const form = ref({
    invoice_number: '',
    customer_id: 0,
    issue_date: new Date().toISOString().slice(0, 10),
    due_date: '',
    status: 'draft' as InvoiceStatus,
    hourly_rate: '85.00',
    tax_rate_percent: '0',
    notes: '',
});

const totalMinutes = computed(() =>
    items.value.reduce((sum, i) => {
        try {
            return sum + parseHM(i.hours);
        } catch {
            return sum;
        }
    }, 0),
);

const rateCents = computed(() => {
    try {
        return parseUSD(form.value.hourly_rate);
    } catch {
        return 0;
    }
});

const taxRate = computed(() => (Number(form.value.tax_rate_percent) || 0) / 100);

/** Mirrors the invoice_totals SQL view so the preview matches what the server stores. */
const liveTotals = computed<InvoiceTotals>(() => {
    const subtotal = amountCents(totalMinutes.value, rateCents.value);
    const tax = taxCents(subtotal, taxRate.value);
    return {
        invoice_id: invoiceId.value ?? 0,
        total_minutes: totalMinutes.value,
        subtotal_cents: subtotal,
        tax_cents: tax,
        total_cents: subtotal + tax,
        line_item_count: items.value.length,
    };
});

/** The document preview needs a full invoice shape; splice live edits over the saved one. */
const previewInvoice = computed<InvoiceDetail | null>(() => {
    const settings = settingsStore.settings;
    const customer = settingsStore.customers.find((c) => c.id === form.value.customer_id);
    if (!settings) return null;

    const base = invoice.value;
    return {
        id: invoiceId.value ?? 0,
        invoice_number: form.value.invoice_number,
        customer_id: form.value.customer_id,
        status: form.value.status,
        issue_date: form.value.issue_date,
        due_date: form.value.due_date || form.value.issue_date,
        paid_date: base?.paid_date ?? null,
        hourly_rate_cents: rateCents.value,
        tax_rate: taxRate.value,
        customer_name: base?.customer_name ?? customer?.name ?? '',
        customer_address_1: base?.customer_address_1 ?? customer?.address_1 ?? '',
        customer_address_2: base?.customer_address_2 ?? customer?.address_2 ?? '',
        business_name: base?.business_name ?? settings.business_name,
        business_address_1: base?.business_address_1 ?? settings.business_address_1,
        business_address_2: base?.business_address_2 ?? settings.business_address_2,
        terms_html: base?.terms_html ?? settings.default_terms_html,
        notes: form.value.notes || null,
        created_at: base?.created_at ?? '',
        updated_at: base?.updated_at ?? '',
        totals: liveTotals.value,
        line_items: items.value.map((item, index) => ({
            id: 0,
            invoice_id: invoiceId.value ?? 0,
            position: index,
            work_date: item.work_date,
            description: item.description,
            minutes: (() => {
                try {
                    return parseHM(item.hours);
                } catch {
                    return 0;
                }
            })(),
            source: 'manual' as const,
            wrike_timelog_id: item.wrike_timelog_id ?? null,
            wrike_task_id: item.wrike_task_id ?? null,
            wrike_hours_raw: item.wrike_hours_raw ?? null,
        })),
    };
});

const invalidRows = computed(
    () =>
        items.value.filter(
            (i) => !i.description.trim() || !/^\d+:[0-5]?\d$/.test(i.hours.trim()) ||
                !/^\d{4}-\d{2}-\d{2}$/.test(i.work_date),
        ).length,
);

const canSave = computed(
    () =>
        !saving.value &&
        form.value.invoice_number.trim().length > 0 &&
        form.value.customer_id > 0 &&
        invalidRows.value === 0,
);

function toEditable(detail: InvoiceDetail): EditableLineItem[] {
    return detail.line_items.map((item) => ({
        key: `item-${item.id}`,
        work_date: item.work_date,
        description: item.description,
        hours: `${Math.floor(item.minutes / 60)}:${String(item.minutes % 60).padStart(2, '0')}`,
        source: item.source,
        wrike_timelog_id: item.wrike_timelog_id,
        wrike_task_id: item.wrike_task_id,
        wrike_hours_raw: item.wrike_hours_raw,
    }));
}

onMounted(async () => {
    await settingsStore.ensureLoaded();
    try {
        if (isNew.value) {
            const settings = settingsStore.settings;
            form.value.customer_id = settingsStore.customers[0]?.id ?? 0;
            form.value.hourly_rate = ((settings?.default_rate_cents ?? 8500) / 100).toFixed(2);
            form.value.due_date = addDays(form.value.issue_date, settings?.default_net_days ?? 30);
            const suggestion = await api.suggestInvoiceNumber(form.value.issue_date);
            form.value.invoice_number = suggestion.invoice_number;
        } else {
            const detail = await store.fetchOne(invoiceId.value!);
            invoice.value = detail;
            items.value = toEditable(detail);
            form.value = {
                invoice_number: detail.invoice_number,
                customer_id: detail.customer_id,
                issue_date: detail.issue_date,
                due_date: detail.due_date,
                status: detail.status,
                hourly_rate: (detail.hourly_rate_cents / 100).toFixed(2),
                tax_rate_percent: String(detail.tax_rate * 100),
                notes: detail.notes ?? '',
            };
        }
    } catch (err) {
        error.value = (err as Error).message;
    } finally {
        loading.value = false;
    }
});

// Keep the due date in step with the issue date until it is edited by hand.
const dueDateTouched = ref(false);
watch(
    () => form.value.issue_date,
    (issue) => {
        if (!dueDateTouched.value && issue) {
            form.value.due_date = addDays(issue, settingsStore.settings?.default_net_days ?? 30);
        }
    },
);

function toLineItemInputs(): LineItemInput[] {
    return items.value.map((item) => ({
        work_date: item.work_date,
        description: item.description.trim(),
        minutes: parseHM(item.hours),
        source: (item.source as LineItemInput['source']) ?? 'manual',
        wrike_timelog_id: item.wrike_timelog_id ?? null,
        wrike_task_id: item.wrike_task_id ?? null,
        wrike_hours_raw: item.wrike_hours_raw ?? null,
    }));
}

async function save(): Promise<void> {
    saving.value = true;
    error.value = null;
    try {
        if (isNew.value) {
            const created = await store.create({
                invoice_number: form.value.invoice_number.trim(),
                customer_id: form.value.customer_id,
                issue_date: form.value.issue_date,
                due_date: form.value.due_date || undefined,
                status: form.value.status,
                hourly_rate_cents: rateCents.value,
                tax_rate: taxRate.value,
                notes: form.value.notes || null,
                line_items: toLineItemInputs(),
            });
            await router.push(`/invoices/${created.id}`);
        } else {
            await store.update(invoiceId.value!, {
                invoice_number: form.value.invoice_number.trim(),
                customer_id: form.value.customer_id,
                issue_date: form.value.issue_date,
                due_date: form.value.due_date,
                status: form.value.status,
                hourly_rate_cents: rateCents.value,
                tax_rate: taxRate.value,
                notes: form.value.notes || null,
            });
            await store.saveLineItems(invoiceId.value!, toLineItemInputs());
            await router.push(`/invoices/${invoiceId.value}`);
        }
    } catch (err) {
        error.value = (err as Error).message;
    } finally {
        saving.value = false;
    }
}

async function remove(): Promise<void> {
    if (!invoiceId.value) return;
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete invoice ${form.value.invoice_number}? This cannot be undone.`)) return;
    try {
        await store.remove(invoiceId.value);
        await router.push('/');
    } catch (err) {
        error.value = (err as Error).message;
    }
}
</script>

<template>
    <div class="page">
        <div class="page-header">
            <h1>{{ isNew ? 'New invoice' : `Edit ${form.invoice_number}` }}</h1>
            <div style="display: flex; gap: .5rem">
                <button class="btn btn-secondary" type="button" @click="showPreview = !showPreview">
                    {{ showPreview ? 'Hide' : 'Show' }} preview
                </button>
                <RouterLink v-if="!isNew" class="btn btn-secondary" :to="`/invoices/${invoiceId}`">
                    View
                </RouterLink>
                <button class="btn" type="button" :disabled="!canSave" @click="save">
                    {{ saving ? 'Saving…' : 'Save' }}
                </button>
            </div>
        </div>

        <div v-if="error" class="alert alert-error">{{ error }}</div>
        <div v-if="loading" class="spinner">Loading…</div>

        <template v-else>
            <div class="card">
                <div class="field-row">
                    <div class="field">
                        <label for="number">Invoice number</label>
                        <input id="number" v-model="form.invoice_number" type="text" />
                    </div>
                    <div class="field">
                        <label for="customer">Customer</label>
                        <select id="customer" v-model.number="form.customer_id">
                            <option v-for="c in settingsStore.customers" :key="c.id" :value="c.id">
                                {{ c.name }}
                            </option>
                        </select>
                    </div>
                    <div class="field">
                        <label for="status">Status</label>
                        <select id="status" v-model="form.status">
                            <option value="draft">Draft</option>
                            <option value="sent">Sent</option>
                            <option value="paid">Paid</option>
                            <option value="void">Void</option>
                        </select>
                    </div>
                </div>

                <div class="field-row">
                    <div class="field">
                        <label for="issue">Issue date</label>
                        <input id="issue" v-model="form.issue_date" type="date" />
                    </div>
                    <div class="field">
                        <label for="due">Due date</label>
                        <input id="due" v-model="form.due_date" type="date" @input="dueDateTouched = true" />
                    </div>
                    <div class="field">
                        <label for="rate">Hourly rate</label>
                        <input id="rate" v-model="form.hourly_rate" type="text" inputmode="decimal" />
                    </div>
                    <div class="field">
                        <label for="tax">Tax rate (%)</label>
                        <input id="tax" v-model="form.tax_rate_percent" type="text" inputmode="decimal" />
                    </div>
                </div>
            </div>

            <div class="card">
                <h2 style="font-size: var(--font-size-lg); margin-bottom: .5rem">Line items</h2>
                <LineItemTable v-model="items" :default-date="form.issue_date" />
            </div>

            <div class="card" style="display: flex; justify-content: space-between; align-items: center">
                <div>
                    <strong>{{ formatUSD(liveTotals.total_cents) }}</strong>
                    <span class="muted"> balance due</span>
                </div>
                <button v-if="!isNew" class="btn btn-danger" type="button" @click="remove">
                    Delete invoice
                </button>
            </div>

            <div v-if="showPreview && previewInvoice" class="card">
                <h2 style="font-size: var(--font-size-lg); margin-bottom: .5rem">Preview</h2>
                <InvoiceDocument :invoice="previewInvoice" :totals-override="liveTotals" />
            </div>
        </template>
    </div>
</template>
