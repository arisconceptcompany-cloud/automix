import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 3001,
    watch: {
      ignored: ['**/.cache/**', '**/Cache/**', '**/node_modules/**'],
    },
    proxy: {
      '/api': {
        target: 'http://167.86.118.96:5005',
        changeOrigin: true,
      },
    },
  },
})
