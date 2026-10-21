import { defineConfig } from "vite";

const { NODE_ENV = "production" } = process.env;
const IS_PROD = NODE_ENV === "production";
const FILE_NAMES: Record<string, string> = {
  es: "neux.esm.js",
  umd: "neux.umd.js",
};

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      name: "neux",
      formats: ["es", "umd"],
      fileName: (format) => FILE_NAMES[format],
    },
    outDir: "dist",
    // ES2020 is what the `browserslist` targets support (checked after `npm run build`),
    // so the minifier does not emit newer syntax such as `??=`.
    target: "es2020",
    sourcemap: !IS_PROD,
    minify: IS_PROD,
    rolldownOptions: {
      output: {
        // ESM is strict by itself, but the UMD build is not: there, a bare call
        // such as `const { signal } = neux; signal()` gets `window` as `this`,
        // a different reactive context than `neux.effect()` uses.
        strict: true,
        // Vite skips whitespace minification for ESM lib builds; force it. Pure
        // annotations are dropped too: `sideEffects: false` already lets
        // bundlers tree-shake the library.
        ...(IS_PROD && { minify: true, comments: false }),
      },
    },
  },
});
