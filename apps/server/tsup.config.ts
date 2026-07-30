import { defineConfig } from 'tsup';

/**
 * Bundles the server for production. `@collabboard/shared` is source-only, so we
 * inline it (noExternal); everything else in node_modules stays external and is
 * resolved at runtime from the installed dependencies.
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  noExternal: [/@collabboard\/shared/],
  banner: {
    // Some CJS deps expect `require`; provide it under ESM.
    js: "import { createRequire as _cr } from 'module'; const require = _cr(import.meta.url);",
  },
});
