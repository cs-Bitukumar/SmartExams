const globals = {
  browser: {
    window: 'readonly',
    document: 'readonly',
    navigator: 'readonly',
    location: 'readonly',
    history: 'readonly',
    localStorage: 'readonly',
    sessionStorage: 'readonly',
    URLSearchParams: 'readonly',
    URL: 'readonly',
    Intl: 'readonly',
    FormData: 'readonly',
    fetch: 'readonly',
    AbortController: 'readonly',
    setTimeout: 'readonly',
    setInterval: 'readonly',
    clearTimeout: 'readonly',
    clearInterval: 'readonly',
    requestAnimationFrame: 'readonly',
    queueMicrotask: 'readonly',
    getComputedStyle: 'readonly',
    matchMedia: 'readonly',
    Event: 'readonly',
    CustomEvent: 'readonly',
    CSS: 'readonly',
    HTMLElement: 'readonly',
    Node: 'readonly',
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
