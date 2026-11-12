import { buildCss, tokens } from '@dck/design'
import { defineConfig, type Plugin } from 'vite'

const virtualTokens = 'virtual:dck-tokens.css'

// CSS variables come straight from packages/design, with no intermediate file
const tokensCss = (): Plugin => ({
  name: 'dck-tokens',
  resolveId: (id) => (id === virtualTokens ? `\0${virtualTokens}` : undefined),
  load: (id) => (id === `\0${virtualTokens}` ? buildCss(tokens) : undefined),
})

export default defineConfig({
  base: './',
  plugins: [tokensCss()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        // The terminal is the biggest chunk and stands alone; the app stays small and the size warning goes away without silencing it
        codeSplitting: { groups: [{ name: 'xterm', test: /node_modules[\\/]@xterm/ }] },
      },
    },
  },
})
