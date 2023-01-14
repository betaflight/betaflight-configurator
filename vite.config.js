/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
    test: {
        // NOTE: this is a replacement location for karma tests.
        //       moving forward we should colocate tests with the
        //       code they test.
        include: ['test/**/*.test.{js,mjs,cjs}'],
        environment: 'jsdom',
        setupFiles: ['test/setup.js'],
    },
});
