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
    sourcemap: !IS_PROD,
    minify: IS_PROD,
    // Vite skips whitespace minification for ESM lib builds; force it.
    rolldownOptions: IS_PROD ? { output: { minify: true } } : {},
  },
});
