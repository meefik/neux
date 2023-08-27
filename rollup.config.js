import terser from '@rollup/plugin-terser';

export default {
  input: 'src/index.js',
  output: [{
    file: 'dist/neux.umd.js',
    format: 'umd',
    name: 'NEUX'
  }, {
    file: 'dist/neux.esm.js',
    format: 'esm'
  }],
  plugins: [terser()]
};
