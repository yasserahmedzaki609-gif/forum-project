// ============================================================================
// eslint.config.js — Flat config (ESLint 9+)
// ============================================================================

const js = require('@eslint/js');
const prettierConfig = require('eslint-config-prettier');
const globals = require('globals');

module.exports = [
  {
    ignores: [
      'node_modules/',
      'coverage/',
      'data/',
      'media/',
      'certs/',
      'dist/',
      'build/',
      '*.min.js',
      'combined_project.txt',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_', // allows `catch (_)`
        },
      ],
      'no-undef': 'error',
      'no-shadow': 'error',
      'no-redeclare': 'error',
      'no-self-assign': 'error',
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-duplicate-case': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      'no-var': 'error',
      'prefer-const': ['error', { destructuring: 'all' }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },

  // ---- Test files: relax unused-vars to warn ----
  // Tests often capture values for debugging or as side effects of an
  // assertion. Downgrading to 'warn' keeps CI green while leaving a visible
  // signal to clean up when convenient.
  {
    files: ['tests/**/*.js'],
    rules: {
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  prettierConfig,
];
