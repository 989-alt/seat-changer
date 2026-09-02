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
    files: ['src/core/**/*.{ts,tsx,js,jsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            'react',
            'react/*',
            'react-dom',
            'react-dom/*',
            'zustand',
            'zustand/*',
            'zundo',
            'zundo/*',
            '@/components/*',
            '@/store/*',
            '@/pages/*',
            '**/components/**',
            '**/store/**',
            '**/pages/**',
          ],
        },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'sessionStorage', 'navigator'],
      'no-restricted-syntax': [
        'error',
        { selector: 'ImportExpression', message: 'core/에서는 동적 import를 쓰지 않는다' },
        { selector: "MemberExpression[object.name='globalThis']", message: 'core/에서는 globalThis로 브라우저 전역에 접근하지 않는다' },
        { selector: "Identifier[name='globalThis']", message: 'core/에서는 globalThis를 쓰지 않는다' },
      ],
    },
  },
);
