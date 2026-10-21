import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: './',
  plugins: [vue(), tailwindcss()],
  // 開發時將 API 與上傳檔轉送到後端（server/，預設 :3000）
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/files': 'http://localhost:3000',
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
})
