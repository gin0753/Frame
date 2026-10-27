import tseslint from 'typescript-eslint';
export default [
  ...tseslint.configs.recommended,
  { ignores: ['dist/**'] },
  {
    files: ['**/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
];
