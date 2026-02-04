import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['./src/index.ts'],
  format: ['esm'],
  target: 'node22',
  unbundle: false,
  // Explicitly mark what should be external (everything except workspace packages)
  // pdf-parse and mammoth are CommonJS modules that must not be bundled
  external: [/^express/, /^cors/, /^dotenv/, /^zod/, /^ai/, /^pdf-parse/, /^mammoth/],
  // Force workspace packages to be bundled
  noExternal: [/@chat-template\/.*/],
  dts: false,
});
