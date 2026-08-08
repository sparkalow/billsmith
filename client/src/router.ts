import { createRouter, createWebHistory } from 'vue-router';

import InvoiceList from '@/views/InvoiceList.vue';
import InvoicePrint from '@/views/InvoicePrint.vue';
import InvoiceEdit from '@/views/InvoiceEdit.vue';
import SettingsView from '@/views/SettingsView.vue';

export const router = createRouter({
    history: createWebHistory(),
    routes: [
        { path: '/', name: 'invoices', component: InvoiceList },
        // `/invoices/new` must precede `/invoices/:id` or "new" is read as an id.
        { path: '/invoices/new', name: 'invoice-new', component: InvoiceEdit },
        { path: '/invoices/:id', name: 'invoice', component: InvoicePrint },
        { path: '/invoices/:id/edit', name: 'invoice-edit', component: InvoiceEdit },
        { path: '/settings', name: 'settings', component: SettingsView },
        { path: '/:pathMatch(.*)*', redirect: '/' },
    ],
});
