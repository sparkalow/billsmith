import { defineStore } from 'pinia';
import { ref } from 'vue';

import * as api from '@/api/client';
import type { ReportsResponse } from '@shared/types.js';

export const useReportsStore = defineStore('reports', () => {
    const report = ref<ReportsResponse | null>(null);
    const loading = ref(false);
    const error = ref<string | null>(null);

    async function load(): Promise<void> {
        loading.value = true;
        error.value = null;
        try {
            report.value = await api.getReports();
        } catch (err) {
            error.value = (err as Error).message;
        } finally {
            loading.value = false;
        }
    }

    /**
     * Load once. The report tabs are child routes, so switching tabs re-mounts a view
     * and would otherwise refetch all three reports on every click.
     */
    async function ensureLoaded(): Promise<void> {
        if (!report.value) {await load();}
    }

    return { report, loading, error, load, ensureLoaded };
});
