import { defineStore } from 'pinia';
import { ref } from 'vue';

import * as api from '@/api/client';
import type { SettingsRow, CustomerRow } from '@shared/types.js';

export const useSettingsStore = defineStore('settings', () => {
    const settings = ref<SettingsRow | null>(null);
    const customers = ref<CustomerRow[]>([]);
    const loading = ref(false);
    const error = ref<string | null>(null);

    async function load(): Promise<void> {
        loading.value = true;
        error.value = null;
        try {
            const [s, c] = await Promise.all([api.getSettings(), api.listCustomers()]);
            settings.value = s;
            customers.value = c;
        } catch (err) {
            error.value = (err as Error).message;
        } finally {
            loading.value = false;
        }
    }

    /** Load once; views call this freely without refetching on every mount. */
    async function ensureLoaded(): Promise<void> {
        if (!settings.value) {await load();}
    }

    async function save(patch: Partial<SettingsRow>): Promise<void> {
        settings.value = await api.updateSettings(patch);
    }

    async function addCustomer(input: { name: string; address_1?: string; address_2?: string }) {
        const customer = await api.createCustomer(input);
        customers.value = [...customers.value, customer].sort((a, b) => a.name.localeCompare(b.name));
        return customer;
    }

    async function saveCustomer(id: number, patch: Partial<CustomerRow>) {
        const updated = await api.updateCustomer(id, patch);
        customers.value = customers.value.map((c) => (c.id === id ? updated : c));
        return updated;
    }

    return { settings, customers, loading, error, load, ensureLoaded, save, addCustomer, saveCustomer };
});
