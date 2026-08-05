import { createApp } from 'vue';
import { createPinia } from 'pinia';

import App from './App.vue';
import { router } from './router';

import './assets/tokens.css';
import './assets/invoice.css';
import './assets/app.css';

createApp(App).use(createPinia()).use(router).mount('#app');
