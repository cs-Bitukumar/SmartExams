const globals = {
  browser: {
    window: 'readonly',
    document: 'readonly',
    URLSearchParams: 'readonly',
    Intl: 'readonly',
    FormData: 'readonly',
    fetch: 'readonly',
    clearInterval: 'readonly',
  },
  node: {
    require: 'readonly',
    module: 'readonly',
    process: 'readonly',
    __dirname: 'readonly',
    console: 'readonly',
  },
  jest: {
    beforeAll: 'readonly',
    beforeEach: 'readonly',
    afterAll: 'readonly',
    describe: 'readonly',
    it: 'readonly',
    expect: 'readonly',
  },
};

module.exports = [
  {
    ignores: ['node_modules/**'],
  },
  {
    files: ['backend/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['backend/tests/**/*.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
    },
  },
  {
    files: ['frontend/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.browser },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    },
  },
];
