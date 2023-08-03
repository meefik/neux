import terser from '@rollup/plugin-terser';

export default {
  input: 'src/index.js',
  output: [{
    file: 'dist/neux.min.js',
    format: 'umd',
    name: 'NEUX'
  }],
  plugins: [terser()]
};
