import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      name: "neux",
      formats: ["umd", "es"],
      fileName: (format) => {
        return format === "umd" ? "neux.umd.js" : "neux.esm.js";
      },
    },
    // ES2020 is what the `browserslist` targets support (checked after `npm run build`),
    // so the minifier does not emit newer syntax such as `??=`.
    target: "es2020",
    rolldownOptions: {
      output: {
        // ESM is strict by itself, but the UMD build is not: there, a bare call
        // such as `const { signal } = neux; signal()` gets `window` as `this`,
        // a different reactive context than `neux.effect()` uses.
        strict: true,
        // Vite skips whitespace minification for ESM lib builds; force it. Pure
        // annotations are dropped too: `sideEffects: false` already lets
        // bundlers tree-shake the library.
        minify: true,
        comments: false,
      },
    },
  },
});
