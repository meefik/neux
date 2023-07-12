import terser from '@rollup/plugin-terser';

export default {
  input: 'src/index.js',
  output: [{
    file: 'dist/vuex.min.js',
    format: 'umd',
    name: 'Vuex'
  }],
  plugins: [terser()]
};
