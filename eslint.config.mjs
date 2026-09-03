import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
  recommendedConfig: js.configs.recommended,
});

const eslintConfig = [
  {
    ignores: [
      '.next/**',
      '.next-stale-*/**',
      '.worktrees/**',
      '.playwright-cli/**',
      'functions/lib/**',
      'functions/node_modules/**',
      'next-env.d.ts',
      'node_modules/**',
      'public/sw.js',
      'output/**',
      'scratch/**',
      'testsprite_tests/**',
    ],
  },
  ...compat.config({
    extends: ['next/core-web-vitals', 'next/typescript'],
  }),
  {
    rules: {
      // Existing dynamic Firestore/document shapes remain visible as migration
      // warnings while correctness rules continue to fail the release gate.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      'react/no-unescaped-entities': 'warn',
      '@next/next/no-page-custom-font': 'warn',
    },
  },
];

export default eslintConfig;
