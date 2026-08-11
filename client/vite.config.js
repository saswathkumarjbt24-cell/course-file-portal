import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Served from https://USERNAME.github.io/course-file-portal/
  base: '/course-file-portal/',
  plugins: [react()],
  server: {
    port: 5175,
    strictPort: true
  }
})
