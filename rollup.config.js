import terser from '@rollup/plugin-terser';

const { NODE_ENV = 'production' } = process.env;

export default {
  input: 'src/index.js',
  output: [{
    file: 'dist/neux.umd.js',
    format: 'umd',
    name: 'neux',
  }, {
    file: 'dist/neux.esm.js',
    format: 'esm',
  }],
  plugins: NODE_ENV === 'production' ? [terser()] : [],
};
