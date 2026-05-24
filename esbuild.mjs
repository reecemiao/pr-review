import { build, context } from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const problemMatcherPlugin = {
    name: 'problem-matcher',
    setup(b) {
        b.onStart(() => {
            console.log('[esbuild] build started');
        });
        b.onEnd((result) => {
            for (const { text, location } of result.errors) {
                console.error(`✖ [ERROR] ${text}`);
                if (location) {
                    console.error(`    ${location.file}:${location.line}:${location.column}`);
                }
            }
            console.log(`[esbuild] build finished (${result.errors.length} errors)`);
        });
    },
};

const options = {
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node22',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    logLevel: 'silent',
    plugins: [problemMatcherPlugin],
};

if (watch) {
    const ctx = await context(options);
    await ctx.watch();
} else {
    await build(options);
}
