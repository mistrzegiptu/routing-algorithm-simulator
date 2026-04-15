import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', 
    port: 5173,

    watch: {
      usePolling: true,
      interval: 100,
    },

    hmr: {
      clientPort: 5173,
      host: 'localhost', 
    },
    
    proxy: {
      '/api': {
        target: 'http://backend:5000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://backend:5000',
        ws: true,
        changeOrigin: true,
      }
    }
  }
})