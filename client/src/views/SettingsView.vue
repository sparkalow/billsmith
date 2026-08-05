<script setup lang="ts">
/**
 * Business identity, default terms, rate, and customers.
 *
 * Editing these changes defaults for *future* invoices only. Existing invoices carry
 * their own snapshot, so a new address never rewrites what an old invoice said.
 */

import { ref, onMounted } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import { parseUSD, formatUSD } from '@shared/duration.js';

const store = useSettingsStore();

const form = ref({
    business_name: '',
    business_address_1: '',
    business_address_2: '',
    default_terms_html: '',
    default_rate: '85.00',
    default_net_days: 30,
    wrike_contact_id: '',
});

const saving = ref(false);
const saved = ref(false);
const error = ref<string | null>(null);

const newCustomer = ref({ name: '', address_1: '', address_2: '' });

onMounted(async () => {
    await store.load();
    const s = store.settings;
    if (s) {
        form.value = {
            business_name: s.business_name,
            business_address_1: s.business_address_1,
            business_address_2: s.business_address_2,
            default_terms_html: s.default_terms_html,
            default_rate: (s.default_rate_cents / 100).toFixed(2),
            default_net_days: s.default_net_days,
            wrike_contact_id: s.wrike_contact_id ?? '',
        };
    }
});

async function save(): Promise<void> {
    saving.value = true;
    saved.value = false;
    error.value = null;
    try {
        await store.save({
            business_name: form.value.business_name,
            business_address_1: form.value.business_address_1,
            business_address_2: form.value.business_address_2,
            default_terms_html: form.value.default_terms_html,
            default_rate_cents: parseUSD(form.value.default_rate),
            default_net_days: Number(form.value.default_net_days),
            wrike_contact_id: form.value.wrike_contact_id || null,
        });
        saved.value = true;
    } catch (err) {
        error.value = (err as Error).message;
    } finally {
        saving.value = false;
    }
}

async function addCustomer(): Promise<void> {
    if (!newCustomer.value.name.trim()) return;
    try {
        await store.addCustomer({ ...newCustomer.value });
        newCustomer.value = { name: '', address_1: '', address_2: '' };
    } catch (err) {
        error.value = (err as Error).message;
    }
}
</script>

<template>
    <div class="page">
        <div class="page-header">
            <h1>Settings</h1>
            <RouterLink class="btn btn-secondary" to="/">← All invoices</RouterLink>
        </div>

        <div v-if="error" class="alert alert-error">{{ error }}</div>
        <div v-if="saved" class="alert alert-info">Saved.</div>

        <div class="card">
            <h2 style="font-size: var(--font-size-lg); margin-bottom: .75rem">Your business</h2>
            <p class="muted" style="margin-bottom: .75rem">
                Appears as “Pay to” on new invoices. Existing invoices keep their own snapshot.
            </p>
            <div class="field-row">
                <div class="field">
                    <label for="bn">Name</label>
                    <input id="bn" v-model="form.business_name" type="text" />
                </div>
                <div class="field">
                    <label for="ba1">Address line 1</label>
                    <input id="ba1" v-model="form.business_address_1" type="text" />
                </div>
                <div class="field">
                    <label for="ba2">Address line 2</label>
                    <input id="ba2" v-model="form.business_address_2" type="text" />
                </div>
            </div>
            <div class="field-row">
                <div class="field">
                    <label for="rate">Default hourly rate</label>
                    <input id="rate" v-model="form.default_rate" type="text" inputmode="decimal" />
                </div>
                <div class="field">
                    <label for="net">Payment terms (days)</label>
                    <input id="net" v-model.number="form.default_net_days" type="number" min="0" />
                </div>
                <div class="field">
                    <label for="wrike">Wrike contact id</label>
                    <input id="wrike" v-model="form.wrike_contact_id" type="text" />
                </div>
            </div>
            <div class="field">
                <label for="terms">Default terms (HTML)</label>
                <textarea id="terms" v-model="form.default_terms_html" rows="4"></textarea>
            </div>
            <button class="btn" type="button" style="margin-top: .75rem" :disabled="saving" @click="save">
                {{ saving ? 'Saving…' : 'Save settings' }}
            </button>
        </div>

        <div class="card">
            <h2 style="font-size: var(--font-size-lg); margin-bottom: .75rem">Customers</h2>
            <div v-for="c in store.customers" :key="c.id" class="field-row" style="align-items: flex-end">
                <div class="field">
                    <label>Name</label>
                    <input :value="c.name" type="text" @change="store.saveCustomer(c.id, { name: ($event.target as HTMLInputElement).value })" />
                </div>
                <div class="field">
                    <label>Address line 1</label>
                    <input :value="c.address_1" type="text" @change="store.saveCustomer(c.id, { address_1: ($event.target as HTMLInputElement).value })" />
                </div>
                <div class="field">
                    <label>Address line 2</label>
                    <input :value="c.address_2" type="text" @change="store.saveCustomer(c.id, { address_2: ($event.target as HTMLInputElement).value })" />
                </div>
                <div class="field" style="flex: 0 0 8rem">
                    <label>Default rate</label>
                    <span class="muted" style="padding: .35rem 0">
                        {{ c.default_rate_cents ? formatUSD(c.default_rate_cents) : 'uses default' }}
                    </span>
                </div>
            </div>

            <hr style="margin: 1rem 0; border: none; border-top: 1px solid var(--ui-border)" />

            <div class="field-row" style="align-items: flex-end">
                <div class="field">
                    <label for="ncn">New customer</label>
                    <input id="ncn" v-model="newCustomer.name" type="text" placeholder="Name" />
                </div>
                <div class="field">
                    <label for="nca1">Address line 1</label>
                    <input id="nca1" v-model="newCustomer.address_1" type="text" />
                </div>
                <div class="field">
                    <label for="nca2">Address line 2</label>
                    <input id="nca2" v-model="newCustomer.address_2" type="text" />
                </div>
                <button class="btn btn-secondary" type="button" @click="addCustomer">Add</button>
            </div>
        </div>
    </div>
</template>
