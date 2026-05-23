import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['src/test/unit/**/*.test.ts'],
        environment: 'node',
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: ['src/**/*.ts'],
            exclude: ['src/test/**', 'src/**/*.d.ts'],
        },
    },
    resolve: {
        alias: {
            vscode: fileURLToPath(new URL('./src/test/_stubs/vscode.ts', import.meta.url)),
        },
    },
});
