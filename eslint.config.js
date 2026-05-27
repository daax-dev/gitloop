import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', '.logs/**', 'backlog/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  // Layering (see src/README.md): core imports neither pipeline nor adapters;
  // pipeline imports core only, never adapters. Dependencies point one direction.
  {
    files: ['src/core/**/*.ts'],
    rules: {
      // Static imports.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/pipeline/**', '**/adapters/**'],
              message: 'core must not import pipeline or adapters',
            },
          ],
        },
      ],
      // Dynamic import() expressions (not caught by no-restricted-imports).
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression[source.value=/\\/(pipeline|adapters)\\//]',
          message: 'core must not dynamically import pipeline or adapters',
        },
      ],
    },
  },
  {
    files: ['src/pipeline/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [{ group: ['**/adapters/**'], message: 'pipeline must not import adapters' }],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression[source.value=/\\/adapters\\//]',
          message: 'pipeline must not dynamically import adapters',
        },
      ],
    },
  },
  {
    files: ['**/*.js', '*.config.ts'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
);
