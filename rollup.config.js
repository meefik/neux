import terser from "@rollup/plugin-terser";

const { NODE_ENV = "production" } = process.env;
const isProd = NODE_ENV === "production";

const packages = ["index:neux"];
const builds = packages.flatMap((pkg) => {
  const [input, name = input] = pkg.split(":");
  return ["umd", "esm"].map((format) => ({
    input: `src/${input}.js`,
    output: {
      file: `dist/${name}.${format}.js`,
      format,
      name: format === "umd" ? name : undefined,
      sourcemap: !isProd,
    },
  }));
});

export default builds.map((config) => ({
  ...config,
  plugins: isProd ? [terser()] : [],
}));
