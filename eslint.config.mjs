import antfu from '@antfu/eslint-config'

export default antfu({
  formatters: true,
  typescript: {
    overrides: {
      'ts/no-floating-promises': 'error',
    },
    parserOptions: {
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
