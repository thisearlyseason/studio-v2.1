import { FlatCompat } from '@eslint/eslintrc';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const baseDirectory = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory });

const config = [
  { ignores: ['.next/**', '.next-stale-*/**', 'node_modules/**', 'output/**', '.playwright-cli/**', '.local-tools/**'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'warn',
      '@typescript-eslint/triple-slash-reference': 'warn',
      '@next/next/no-html-link-for-pages': 'warn',
      '@next/next/no-img-element': 'warn',
      'import/no-anonymous-default-export': 'warn',
      'prefer-const': 'warn',
      'react/no-unescaped-entities': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];

export default config;
