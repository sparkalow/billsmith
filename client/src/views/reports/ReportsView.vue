<script setup lang="ts">
/**
 * Reports shell. Owns the single fetch and the loading/error branches so the three
 * child reports can assume `store.report` is populated.
 */
import { onMounted } from 'vue';
import { useReportsStore } from '@/stores/reports';

const store = useReportsStore();

onMounted(() => store.ensureLoaded());
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1>Reports</h1>
      <button
        class="btn btn-secondary btn-sm no-print"
        :disabled="store.loading"
        @click="store.load()"
      >
        Refresh
      </button>
    </div>

    <nav class="report-tabs no-print">
      <RouterLink to="/reports/yearly">
        Yearly totals
      </RouterLink>
      <RouterLink to="/reports/outstanding">
        Outstanding
      </RouterLink>
      <RouterLink to="/reports/customers">
        By customer
      </RouterLink>
    </nav>

    <div
      v-if="store.error"
      class="alert alert-error"
    >
      {{ store.error }}
    </div>
    <div
      v-if="store.loading"
      class="spinner"
    >
      Loading…
    </div>

    <RouterView v-else-if="store.report" />
  </div>
</template>
