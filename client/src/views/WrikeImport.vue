<script setup lang="ts">
/**
 * Wrike import. Replaces src/get-wrike-time.js.
 *
 * The step the CLI never had is the review pass: fetch a range, see what came back,
 * drop or reword anything before it becomes a line item. Timelogs already attached to
 * an invoice are flagged and excluded by default, so the same work cannot be billed
 * twice — the old script had no way to know.
 */

import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';

import * as api from '@/api/client';
import type { RangeOverlap } from '@/api/client';
import { useSettingsStore } from '@/stores/settings';
import { formatHM, formatUSD, amountCents } from '@shared/duration.js';
import { monthBounds } from '@shared/dates.js';
import type { WrikeTimelogPreview } from '@shared/types.js';

const router = useRouter();
const settingsStore = useSettingsStore();

const today = new Date().toISOString().slice(0, 10);
// Default to last month — the usual case is invoicing work already completed.
const lastMonth = new Date();
lastMonth.setUTCDate(1);
lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
const defaults = monthBounds(lastMonth.toISOString().slice(0, 10));

const start = ref(defaults.start);
const end = ref(defaults.end);
const customerId = ref(0);
const invoiceNumber = ref('');
const skipImported = ref(true);

const timelogs = ref<WrikeTimelogPreview[]>([]);
const overlaps = ref<RangeOverlap[]>([]);
const excluded = ref<Set<string>>(new Set());
const loading = ref(false);
const creating = ref(false);
const error = ref<string | null>(null);
const warning = ref<string | null>(null);
const fetched = ref<number | null>(null);

const selectable = computed(() =>
    timelogs.value.filter((t) => !(skipImported.value && t.already_imported)),
);

const selected = computed(() => selectable.value.filter((t) => !excluded.value.has(t.id)));

const totalMinutes = computed(() => selected.value.reduce((sum, t) => sum + t.minutes, 0));

const rateCents = computed(() => settingsStore.settings?.default_rate_cents ?? 8500);

const estimate = computed(() => amountCents(totalMinutes.value, rateCents.value));

const alreadyImportedCount = computed(() => timelogs.value.filter((t) => t.already_imported).length);

onMounted(async () => {
    await settingsStore.ensureLoaded();
    customerId.value = settingsStore.customers[0]?.id ?? 0;
    // Show anything already cached for the default range without calling Wrike.
    await loadCached();
});

async function loadCached(): Promise<void> {
    try {
        const response = await api.cachedWrikeTimelogs(start.value, end.value);
        timelogs.value = response.timelogs;
        overlaps.value = response.overlaps ?? [];
        excluded.value = new Set();
    } catch {
        // A cold cache is not an error worth showing.
    }
}

async function fetchFromWrike(): Promise<void> {
    loading.value = true;
    error.value = null;
    warning.value = null;
    try {
        const response = await api.fetchWrikeTimelogs(start.value, end.value);
        timelogs.value = response.timelogs;
        overlaps.value = response.overlaps ?? [];
        fetched.value = response.fetched;
        warning.value = response.warning ?? null;
        excluded.value = new Set();
    } catch (err) {
        error.value = (err as Error).message;
    } finally {
        loading.value = false;
    }
}

function toggle(id: string): void {
    const next = new Set(excluded.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    excluded.value = next;
}

async function createDraft(): Promise<void> {
    creating.value = true;
    error.value = null;
    try {
        const invoice = await api.createInvoiceFromWrike({
            start: start.value,
            end: end.value,
            customer_id: customerId.value,
            invoice_number: invoiceNumber.value.trim() || undefined,
            skip_imported: skipImported.value,
        });

        // Excluding a row here is a review decision, so drop it from the draft before
        // the invoice is ever looked at.
        if (excluded.value.size > 0) {
            const keep = invoice.line_items
                .filter((item) => !item.wrike_timelog_id || !excluded.value.has(item.wrike_timelog_id))
                .map((item) => ({
                    work_date: item.work_date,
                    description: item.description,
                    minutes: item.minutes,
                    source: item.source,
                    wrike_timelog_id: item.wrike_timelog_id,
                    wrike_task_id: item.wrike_task_id,
                    wrike_hours_raw: item.wrike_hours_raw,
                }));
            await api.putLineItems(invoice.id, keep);
        }

        await router.push(`/invoices/${invoice.id}/edit`);
    } catch (err) {
        error.value = (err as Error).message;
    } finally {
        creating.value = false;
    }
}
</script>

<template>
    <div class="page">
        <div class="page-header">
            <h1>Import from Wrike</h1>
            <RouterLink class="btn btn-secondary" to="/">← All invoices</RouterLink>
        </div>

        <div v-if="error" class="alert alert-error">{{ error }}</div>
        <div v-if="warning" class="alert alert-warn">
            {{ warning }} — showing cached timelogs from the last successful fetch.
        </div>

        <!-- Invoices migrated from the legacy markdown carry no Wrike timelog ids, so
             the per-row "invoiced" flag cannot detect them. This catches those. -->
        <div v-if="overlaps.length" class="alert alert-warn">
            <strong>This range is already covered by
                {{ overlaps.length === 1 ? 'an invoice' : 'invoices' }}.</strong>
            Importing again would bill the work twice.
            <ul style="margin: .4rem 0 0 1.2rem">
                <li v-for="o in overlaps" :key="o.id">
                    <RouterLink :to="`/invoices/${o.id}`">{{ o.invoice_number }}</RouterLink>
                    — {{ o.item_count }} line item{{ o.item_count === 1 ? '' : 's' }}
                    dated in this range
                </li>
            </ul>
        </div>

        <div class="card">
            <div class="field-row">
                <div class="field">
                    <label for="start">From</label>
                    <input id="start" v-model="start" type="date" :max="today" />
                </div>
                <div class="field">
                    <label for="end">To</label>
                    <input id="end" v-model="end" type="date" :max="today" />
                </div>
                <div class="field">
                    <label for="cust">Customer</label>
                    <select id="cust" v-model.number="customerId">
                        <option v-for="c in settingsStore.customers" :key="c.id" :value="c.id">
                            {{ c.name }}
                        </option>
                    </select>
                </div>
                <div class="field">
                    <label for="num">Invoice number</label>
                    <input id="num" v-model="invoiceNumber" type="text" placeholder="auto" />
                </div>
            </div>
            <div style="display: flex; gap: .75rem; align-items: center; flex-wrap: wrap">
                <button class="btn" type="button" :disabled="loading" @click="fetchFromWrike">
                    {{ loading ? 'Fetching…' : 'Fetch timelogs' }}
                </button>
                <label style="display: flex; gap: .3rem; align-items: center">
                    <input v-model="skipImported" type="checkbox" style="width: auto" />
                    Skip already-invoiced timelogs
                </label>
                <span v-if="fetched !== null" class="muted">{{ fetched }} fetched from Wrike</span>
            </div>
        </div>

        <div v-if="timelogs.length" class="card">
            <div class="page-header" style="margin-bottom: .5rem">
                <h2 style="font-size: var(--font-size-lg)">
                    {{ selected.length }} of {{ selectable.length }} selected
                </h2>
                <div>
                    <strong>{{ formatHM(totalMinutes) }}</strong>
                    <span class="muted"> · est. {{ formatUSD(estimate) }}</span>
                </div>
            </div>

            <p v-if="alreadyImportedCount && skipImported" class="alert alert-info">
                {{ alreadyImportedCount }} timelog{{ alreadyImportedCount === 1 ? '' : 's' }}
                already {{ alreadyImportedCount === 1 ? 'belongs' : 'belong' }} to an invoice and
                {{ alreadyImportedCount === 1 ? 'is' : 'are' }} excluded.
            </p>

            <table class="line-item-editor">
                <thead>
                    <tr>
                        <th style="width: 2rem"></th>
                        <th class="col-date">Date</th>
                        <th>Comment</th>
                        <th class="col-hours">Hours</th>
                    </tr>
                </thead>
                <tbody>
                    <tr
                        v-for="log in timelogs"
                        :key="log.id"
                        :style="{
                            opacity:
                                (skipImported && log.already_imported) || excluded.has(log.id) ? 0.4 : 1,
                        }"
                    >
                        <td>
                            <input
                                type="checkbox"
                                style="width: auto"
                                :disabled="skipImported && log.already_imported"
                                :checked="!excluded.has(log.id) && !(skipImported && log.already_imported)"
                                @change="toggle(log.id)"
                            />
                        </td>
                        <td>{{ log.tracked_date }}</td>
                        <td>
                            {{ log.comment }}
                            <span v-if="log.already_imported" class="badge" style="margin-left: .4rem">
                                invoiced
                            </span>
                        </td>
                        <td style="text-align: right">{{ formatHM(log.minutes) }}</td>
                    </tr>
                </tbody>
            </table>

            <div style="margin-top: 1rem">
                <button
                    class="btn"
                    type="button"
                    :disabled="creating || selected.length === 0 || customerId === 0"
                    @click="createDraft"
                >
                    {{ creating ? 'Creating…' : `Create draft invoice (${selected.length} items)` }}
                </button>
            </div>
        </div>

        <div v-else-if="!loading" class="empty-state">
            <p>No timelogs for this range yet. Pick a range and fetch.</p>
        </div>
    </div>
</template>
