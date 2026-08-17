<script setup lang="ts">
import { computed } from 'vue';
import { useReportsStore } from '@/stores/reports';
import { formatUSD, formatHM } from '@shared/duration.js';
import type { StatusTotals } from '@shared/types.js';

const store = useReportsStore();

const rows = computed(() => store.report?.yearly ?? []);

/** Grand total across every year, so the footer never has to be read off by eye. */
const totals = computed<StatusTotals>(() =>
    rows.value.reduce<StatusTotals>(
        (sum, row) => ({
            invoice_count: sum.invoice_count + row.invoice_count,
            total_minutes: sum.total_minutes + row.total_minutes,
            billed_cents: sum.billed_cents + row.billed_cents,
            collected_cents: sum.collected_cents + row.collected_cents,
            outstanding_cents: sum.outstanding_cents + row.outstanding_cents,
            draft_cents: sum.draft_cents + row.draft_cents,
        }),
        {
            invoice_count: 0,
            total_minutes: 0,
            billed_cents: 0,
            collected_cents: 0,
            outstanding_cents: 0,
            draft_cents: 0,
        },
    ),
);
</script>

<template>
  <template v-if="rows.length">
    <table class="report-table">
      <thead>
        <tr>
          <th>Year</th>
          <th class="num">
            Invoices
          </th>
          <th class="hours">
            Hours
          </th>
          <th class="amount">
            Billed
          </th>
          <th class="amount">
            Collected
          </th>
          <th class="amount">
            Outstanding
          </th>
          <th class="amount">
            Draft
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="row.year"
        >
          <td class="num">
            {{ row.year }}
          </td>
          <td class="num">
            {{ row.invoice_count }}
          </td>
          <td class="hours">
            {{ formatHM(row.total_minutes) }}
          </td>
          <td class="amount">
            {{ formatUSD(row.billed_cents) }}
          </td>
          <td class="amount">
            {{ formatUSD(row.collected_cents) }}
          </td>
          <td class="amount">
            {{ formatUSD(row.outstanding_cents) }}
          </td>
          <td class="amount muted">
            {{ formatUSD(row.draft_cents) }}
          </td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          <td class="num">
            {{ totals.invoice_count }}
          </td>
          <td class="hours">
            {{ formatHM(totals.total_minutes) }}
          </td>
          <td class="amount">
            {{ formatUSD(totals.billed_cents) }}
          </td>
          <td class="amount">
            {{ formatUSD(totals.collected_cents) }}
          </td>
          <td class="amount">
            {{ formatUSD(totals.outstanding_cents) }}
          </td>
          <td class="amount muted">
            {{ formatUSD(totals.draft_cents) }}
          </td>
        </tr>
      </tfoot>
    </table>

    <p class="muted report-note">
      Billed is sent plus paid. Drafts are not yet issued, so they sit outside billed;
      void invoices are excluded everywhere. Years group on the invoice date.
    </p>
  </template>

  <div
    v-else
    class="empty-state"
  >
    <p>No invoices to report on yet.</p>
  </div>
</template>
