import tseslint from 'typescript-eslint';
export default [
  ...tseslint.configs.recommended,
  { ignores: ['dist/**', 'test/**', 'src/generated/**'] },
  {
    files: ['scripts/**/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
];
