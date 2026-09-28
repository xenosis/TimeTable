// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

const nodeGlobals = {
  __dirname: 'readonly',
  console: 'readonly',
  module: 'readonly',
  process: 'readonly',
  require: 'readonly',
};

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      '.expo/**',
      '.tmp/**',
      'android/**/build/**',
      'coverage/**',
      'dist/**',
      'node_modules/**',
    ],
  },
  {
    files: ['scripts/**/*.cjs', 'dashboard/**/*.{js,cjs}', '.claude/hooks/**/*.{js,cjs}', 'eslint.config.js'],
    languageOptions: {
      globals: nodeGlobals,
      sourceType: 'commonjs',
    },
  },
  {
    files: ['__tests__/**/*.{ts,tsx,js,jsx,cjs}'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        afterEach: 'readonly',
        expect: 'readonly',
        it: 'readonly',
        jest: 'readonly',
        test: 'readonly',
      },
    },
  },
]);
