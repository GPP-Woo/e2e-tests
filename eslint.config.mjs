import antfu from '@antfu/eslint-config'

export default antfu({
  // *.check.ts are standalone node run-scripts (top-level await + console by design).
  // scratch/ holds throwaway run artifacts (reports, logs) — not source.
  ignores: ['**/*.check.ts', 'scratch/**'],
  formatters: true,
  typescript: {
    overrides: {
      'ts/no-floating-promises': 'error',
      'ts/await-thenable': 'error',
    },
    parserOptions: {
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
}).append({
  // Fenced code samples inside markdown are extracted as virtual files
  // (e.g. README.md/2_2.ts) that belong to no tsconfig. Lint them untyped and
  // turn off the type-aware rules our `typescript.overrides` enabled globally —
  // they call getParserServices() and throw without a project.
  files: ['**/*.md/**'],
  languageOptions: {
    parserOptions: { projectService: false, project: false },
  },
  rules: {
    'ts/no-floating-promises': 'off',
    'ts/await-thenable': 'off',
  },
})
