import { defineConfig } from "vite";

const { NODE_ENV = "production" } = process.env;
const IS_PROD = NODE_ENV === "production";

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      name: "neux",
      formats: ["umd", "es"],
      fileName: (format) => `neux.${format.replace("es", "esm")}.js`,
    },
    outDir: "dist",
    sourcemap: !IS_PROD,
    minify: IS_PROD,
  },
});
