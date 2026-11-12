import { buildCss, tokens } from '@dck/design'
import { defineConfig, type Plugin } from 'vite'

const virtualTokens = 'virtual:dck-tokens.css'

// As variáveis CSS saem direto de packages/design, sem arquivo intermediário
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
        // O terminal é o maior pedaço e vale sozinho; o app fica pequeno e o aviso de tamanho some sem silenciá-lo
        codeSplitting: { groups: [{ name: 'xterm', test: /node_modules[\\/]@xterm/ }] },
      },
    },
  },
})
