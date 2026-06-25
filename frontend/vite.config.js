import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 개발 서버(5173)에서 /api 요청을 FastAPI(8600)로 프록시 → CORS 신경 안 써도 됨
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8600',
    },
  },
})
