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
        target: 'https://auto.aris-cc.com:5005',
        secure: false,
        changeOrigin: true,
        timeout: 600000,
        proxyTimeout: 600000,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setTimeout(600000)
          })
          proxy.on('proxyRes', (proxyRes) => {
            proxyRes.setTimeout(600000)
          })
        },
      },
    },
    timeout: 600000,
  },
})
