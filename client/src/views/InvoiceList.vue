<script setup lang="ts">

import {onMounted} from 'vue';
import {useInvoiceStore} from '@/stores/invoices';
import {formatUSD, formatHM} from '@shared/duration.js';
import {formatMonthYear} from '@shared/dates.js';

const store = useInvoiceStore();

onMounted(() => store.load());
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1>Invoices</h1>
      <RouterLink
        class="btn"
        to="/invoices/new"
      >
        New invoice
      </RouterLink>
    </div>

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

    <template v-else-if="store.sorted.length">
      <div class="list-head">
        <div>Number</div>
        <div>Date</div>
        <div>Customer</div>
        <div class="hours">
          Hours
        </div>
        <div>Status</div>
        <div class="amount">
          Total
        </div>
      </div>

      <RouterLink
        v-for="invoice in store.sorted"
        :key="invoice.id"
        class="invoice-list-item"
        :class="{ 'is-paid': invoice.status === 'paid', 'is-draft': invoice.status === 'draft' }"
        :to="`/invoices/${invoice.id}`"
      >
        <div class="num">
          {{ invoice.invoice_number }}
        </div>
        <div>{{ formatMonthYear(invoice.issue_date) }}</div>
        <div class="customer-name">
          {{ invoice.customer_name }}
        </div>
        <div class="hours">
          {{ formatHM(invoice.totals.total_minutes) }}
        </div>
        <div>
          <span
            class="badge"
            :class="invoice.status"
          >{{ invoice.status }}</span>
        </div>
        <div class="amount">
          {{ formatUSD(invoice.totals.total_cents) }}
        </div>
      </RouterLink>

      <div class="lifetime-total">
        Cumulative total — {{ formatUSD(store.cumulativeCents) }}
        <span
          v-if="store.unpaidCents"
          class="muted"
          style="color: inherit; opacity: .75"
        >
          · {{ formatUSD(store.unpaidCents) }} outstanding
        </span>
      </div>
    </template>

    <div
      v-else
      class="empty-state"
    >
      <p>No invoices yet.</p>
      <RouterLink
        class="btn"
        to="/invoices/new"
        style="margin-top: 1rem"
      >
        Create the first one
      </RouterLink>
    </div>
  </div>
</template>