module.exports = {
  root: true,
  env: { node: true, es2022: true, browser: false, jest: false },
  parser: '@typescript-eslint/parser',
  parserOptions: { project: ['./apps/server/tsconfig.json', './apps/ui/tsconfig.json'], tsconfigRootDir: __dirname, sourceType: 'module' },
  plugins: ['@typescript-eslint', 'import', 'unused-imports'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'prettier'
  ],
  rules: {
    // Keep no-explicit-any
    '@typescript-eslint/no-explicit-any': ['error'],
    // Prefer const
    'prefer-const': 'warn',
    // Unused imports cleanup
    'unused-imports/no-unused-imports': 'warn',
    // TS-specific unused vars
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    // Import order (groups roughly)
    'import/order': ['warn', { 'newlines-between': 'always', alphabetize: { order: 'asc', caseInsensitive: true } }],
  },
  ignorePatterns: ['**/dist/**', '**/build/**', '**/*.d.ts', 'node_modules/**'],
};
