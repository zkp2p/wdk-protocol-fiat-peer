import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'index.browser': 'src/index.ts',
    'index.node': 'src/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  minify: false,
  target: 'es2021',
  platform: 'neutral',
  outDir: 'dist',
  outputOptions: { exports: 'named' },
});
