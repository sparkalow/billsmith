import { createRouter, createWebHistory } from 'vue-router';

import InvoiceList from '@/views/InvoiceList.vue';
import InvoicePrint from '@/views/InvoicePrint.vue';
import InvoiceEdit from '@/views/InvoiceEdit.vue';
import SettingsView from '@/views/SettingsView.vue';
import ReportsView from '@/views/reports/ReportsView.vue';
import YearlyReport from '@/views/reports/YearlyReport.vue';
import OutstandingReport from '@/views/reports/OutstandingReport.vue';
import CustomerReport from '@/views/reports/CustomerReport.vue';

export const router = createRouter({
    history: createWebHistory(),
    routes: [
        { path: '/', name: 'invoices', component: InvoiceList },
        // `/invoices/new` must precede `/invoices/:id` or "new" is read as an id.
        { path: '/invoices/new', name: 'invoice-new', component: InvoiceEdit },
        { path: '/invoices/:id', name: 'invoice', component: InvoicePrint },
        { path: '/invoices/:id/edit', name: 'invoice-edit', component: InvoiceEdit },
        {
            path: '/reports',
            component: ReportsView,
            children: [
                { path: '', redirect: '/reports/yearly' },
                { path: 'yearly', name: 'report-yearly', component: YearlyReport },
                { path: 'outstanding', name: 'report-outstanding', component: OutstandingReport },
                { path: 'customers', name: 'report-customers', component: CustomerReport },
            ],
        },
        { path: '/settings', name: 'settings', component: SettingsView },
        { path: '/:pathMatch(.*)*', redirect: '/' },
    ],
});
