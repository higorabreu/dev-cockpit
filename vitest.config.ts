import { defineConfig } from 'vitest/config'

// Starting a process takes far longer on Windows, and the git and terminal tests start hundreds at once
const slowProcesses = process.platform === 'win32'

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts'],
    passWithNoTests: true,
    ...(slowProcesses ? { testTimeout: 30_000, hookTimeout: 60_000 } : {}),
  },
})
