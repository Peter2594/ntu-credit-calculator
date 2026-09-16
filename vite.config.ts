import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 相對路徑讓 GitHub Pages 不論 repo 名稱為何都能載入資源
export default defineConfig({
  base: './',
  plugins: [react()],
})
