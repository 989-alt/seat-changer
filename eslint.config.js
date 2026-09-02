import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist', 'legacy', '.superpowers', 'node_modules', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // scripts/*.mjs는 Node CLI로 실행되므로 Node 전역이 필요하다.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly' },
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended[0].rules },
  },
  {
    // core/는 UI·브라우저 의존 금지
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { paths: ['react', 'react-dom', 'zustand', 'zundo'], patterns: ['@/components/*', '@/store/*', '@/pages/*'] }],
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'sessionStorage', 'navigator'],
    },
  },
);
