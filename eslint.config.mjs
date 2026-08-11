import antfu from '@antfu/eslint-config'

export default antfu({
  // *.check.ts are standalone node run-scripts (top-level await + console by design).
  // scratch/ holds throwaway run artifacts (reports, logs) — not source.
  // .claude/ is vendored agent-skill docs; .playwright-cli/ is captured page
  // snapshots. Both are generated/third-party markdown+yaml: reformatting them
  // to our style is churn, and CI failed on it.
  ignores: ['**/*.check.ts', 'scratch/**', '.claude/**', '.playwright-cli/**'],
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
}).append({
  // playwright-bdd requires a step's first arg to be an object-destructuring
  // pattern (it introspects fixture names from it). Steps that need no fixtures
  // but do take capture args must therefore be `async ({}, arg) => …`, which
  // trips no-empty-pattern. The framework contract wins here.
  files: ['**/*.steps.ts'],
  rules: {
    'no-empty-pattern': 'off',
  },
})
