import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
            '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
        },
    },
    // No `server` block on purpose. Vite does not run standalone here — in
    // development the Fastify server mounts it in middleware mode, so the client and
    // the API share one origin and there is nothing to proxy. This config is used by
    // `vite build` and by that embedded dev server. See server/src/app.ts.
});
