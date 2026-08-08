<script setup lang="ts">
/**
 * The invoice document itself
 *
 * Shared between the print view and the editor's live preview, so what you edit is
 * exactly what prints. Totals come from the server's invoice_totals view rather than
 * being recomputed here; the editor passes an optimistic override while typing.
 */

import { computed } from 'vue';
import type { InvoiceDetail, InvoiceTotals } from '@shared/types.js';
import { formatUSD, formatHM } from '@shared/duration.js';
import { formatInvoiceDate, formatLineItemDate } from '@shared/dates.js';

const props = defineProps<{
    invoice: InvoiceDetail;
    /** Live totals while editing, before a save round-trips. */
    totalsOverride?: InvoiceTotals;
}>();

const totals = computed(() => props.totalsOverride ?? props.invoice.totals);
const taxRatePercent = computed(() => `${(props.invoice.tax_rate * 100).toFixed(2)}%`);
</script>

<template>
  <div id="invoice">
    <div
      v-if="invoice.status === 'paid'"
      class="paid-banner"
    >
      PAID
    </div>

    <header>
      <div class="brand">
        <img
          src="/logo.svg"
          alt=""
          width="128"
        >
        <div>
          <small>Pay to:</small>
          <h1>{{ invoice.business_name }}</h1>
          {{ invoice.business_address_1 }}<br>
          {{ invoice.business_address_2 }}
        </div>
      </div>
      <div class="invoice-meta">
        <div class="invoice-date">
          Date: {{ formatInvoiceDate(invoice.issue_date) }}
        </div>
        <div class="invoice-number">
          Invoice No. {{ invoice.invoice_number }}
        </div>
      </div>
    </header>

    <section class="customer-container">
      <h1>Bill To:</h1>
      <div>
        <h2>{{ invoice.customer_name }}</h2>
        {{ invoice.customer_address_1 }}<br>
        {{ invoice.customer_address_2 }}
      </div>
    </section>

    <section class="details">
      <table class="invoice-items">
        <colgroup>
          <col class="col-date">
          <col class="col-description">
          <col class="col-hours">
        </colgroup>
        <thead class="invoice-items-header">
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th class="hours">
              Hours
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in invoice.line_items"
            :key="item.id || `${item.position}-${item.work_date}`"
            class="invoice-item"
          >
            <td class="date">
              {{ formatLineItemDate(item.work_date) }}
            </td>
            <td class="description">
              {{ item.description }}
            </td>
            <td class="hours">
              {{ formatHM(item.minutes) }}
            </td>
          </tr>
        </tbody>
      </table>

      <div class="invoice-footer">
        <div class="terms">
          <h4>Terms</h4>
          <!-- Terms are operator-authored HTML stored per invoice - should be safe -->
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div v-html="invoice.terms_html" />
        </div>
        <div class="totals">
          <label>Total Hours</label><span>{{ formatHM(totals.total_minutes) }}</span>
          <label>Hourly Rate</label><span>{{ formatUSD(invoice.hourly_rate_cents) }}</span>
          <label>Sub Total</label><span>{{ formatUSD(totals.subtotal_cents) }}</span>
          <template v-if="totals.tax_cents > 0">
            <label>Tax ({{ taxRatePercent }})</label><span>{{ formatUSD(totals.tax_cents) }}</span>
          </template>
          <label class="balance-due">Balance Due</label>
          <span class="balance-due">{{ formatUSD(totals.total_cents) }}</span>
        </div>
      </div>
    </section>
  </div>
</template>
