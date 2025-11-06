// Flat ESLint config for server (scoped rules)
import tseslint from 'typescript-eslint';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Ensure tsconfigRootDir resolves to this package when running ESLint from the monorepo root
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default [
  // Global ignores (apply to all files)
  {
    ignores: ['dist/**', '**/dist/**', 'node_modules/**'],
  },
  // Type-aware rules for source files (tsconfig must include src and tests for typed rules)
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: ['./tsconfig.eslint.json'],
        tsconfigRootDir: __dirname,
      },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      // Disallow empty catch blocks explicitly
      'no-empty': ['error', { allowEmptyCatch: false }],
      // Limit nesting to max depth 3
      'max-depth': ['error', 3],
      // Avoid wrapping errors needlessly
      'no-useless-catch': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-require-imports': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/no-unsafe-function-type': 'error',
      '@typescript-eslint/no-empty-object-type': 'error',
      'no-useless-escape': 'error',
      'prefer-const': 'error',
    },
  },
  // Non-src TS files (no project for parser) but same hardened rules
  {
    files: ['**/*.ts', '**/*.tsx'],
    ignores: ['src/**', '__tests__/**'],
    languageOptions: { parser: tseslint.parser },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      // Disallow empty catch blocks explicitly
      'no-empty': ['error', { allowEmptyCatch: false }],
      // Limit nesting to max depth 3
      'max-depth': ['error', 3],
      // Avoid wrapping errors needlessly
      'no-useless-catch': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Typed rules disabled here due to lack of project context
      '@typescript-eslint/no-require-imports': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/no-unsafe-function-type': 'error',
      '@typescript-eslint/no-empty-object-type': 'error',
      'no-useless-escape': 'error',
      'prefer-const': 'error',
    },
  },
  {
    files: ['__tests__/**/*.ts', '__tests__/**/*.tsx'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: ['./tsconfig.eslint.json'],
        tsconfigRootDir: __dirname,
      },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      // Keep tests relaxed for unused vars
      '@typescript-eslint/no-unused-vars': 'off',
      // Tests often use `any` in mocks; allow here only
      '@typescript-eslint/no-explicit-any': 'off',
      // Disallow empty catch blocks explicitly
      'no-empty': ['error', { allowEmptyCatch: false }],
      // Limit nesting to max depth 3
      'max-depth': ['error', 3],
      // Avoid wrapping errors needlessly
      'no-useless-catch': 'error',
      '@typescript-eslint/no-require-imports': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/no-unsafe-function-type': 'error',
      '@typescript-eslint/no-empty-object-type': 'error',
      'no-useless-escape': 'error',
      'prefer-const': 'error',
    },
  },
];
