<script setup lang="ts">
import { computed } from 'vue';
import { useReportsStore } from '@/stores/reports';
import { formatUSD } from '@shared/duration.js';
import { formatInvoiceDate } from '@shared/dates.js';

const store = useReportsStore();

const rows = computed(() => store.report?.outstanding.invoices ?? []);
const totalCents = computed(() => store.report?.outstanding.total_cents ?? 0);

/** Bucket order and labels live here; the cent totals come from the server. */
const buckets = computed(() => {
    const b = store.report?.outstanding.buckets;
    return [
        { key: 'current', label: 'Current', cents: b?.current ?? 0 },
        { key: 'd1_30', label: '1–30 days', cents: b?.d1_30 ?? 0 },
        { key: 'd31_60', label: '31–60 days', cents: b?.d31_60 ?? 0 },
        { key: 'd61_90', label: '61–90 days', cents: b?.d61_90 ?? 0 },
        { key: 'd90_plus', label: '90+ days', cents: b?.d90_plus ?? 0 },
    ];
});
</script>

<template>
  <template v-if="rows.length">
    <p class="report-headline">
      <strong class="amount">{{ formatUSD(totalCents) }}</strong>
      outstanding across {{ rows.length }}
      {{ rows.length === 1 ? 'invoice' : 'invoices' }}
    </p>

    <div class="aging-buckets">
      <div
        v-for="bucket in buckets"
        :key="bucket.key"
        class="aging-bucket"
        :class="{ 'is-empty': !bucket.cents }"
      >
        <span class="aging-bucket-label">{{ bucket.label }}</span>
        <span class="amount">{{ formatUSD(bucket.cents) }}</span>
      </div>
    </div>

    <table class="report-table">
      <thead>
        <tr>
          <th>Number</th>
          <th>Customer</th>
          <th>Due</th>
          <th class="num">
            Age
          </th>
          <th class="amount">
            Amount
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="row.id"
        >
          <td class="num">
            <RouterLink :to="`/invoices/${row.id}`">
              {{ row.invoice_number }}
            </RouterLink>
          </td>
          <td class="customer-name">
            {{ row.customer_name }}
          </td>
          <td class="num">
            {{ formatInvoiceDate(row.due_date) }}
          </td>
          <td class="num">
            <span
              v-if="row.days_overdue > 0"
              class="badge overdue"
            >{{ row.days_overdue }}d overdue</span>
            <span
              v-else
              class="muted"
            >current</span>
          </td>
          <td class="amount">
            {{ formatUSD(row.total_cents) }}
          </td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <td colspan="4">
            Total
          </td>
          <td class="amount">
            {{ formatUSD(totalCents) }}
          </td>
        </tr>
      </tfoot>
    </table>

    <p class="muted report-note">
      Invoices that have been sent but not paid. There is no overdue status — age is
      measured from the due date against today.
    </p>
  </template>

  <div
    v-else
    class="empty-state"
  >
    <p>Nothing outstanding. Every sent invoice has been paid.</p>
  </div>
</template>
