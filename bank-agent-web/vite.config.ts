import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// 后端服务地址（可通过环境变量覆盖）
const BANK_URL = process.env.BANK_URL ?? 'http://127.0.0.1:8000'
const AGENT_URL = process.env.AGENT_BRIDGE_URL ?? 'http://127.0.0.1:8099'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Mock Bank REST：/api/bank/users/U1/accounts -> http://127.0.0.1:8000/users/U1/accounts
      '/api/bank': {
        target: BANK_URL,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/bank/, ''),
      },
      // Agent 桥接服务（SSE）：/api/agent/chat -> http://127.0.0.1:8099/chat
      '/api/agent': {
        target: AGENT_URL,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/agent/, ''),
        // SSE 需要关闭代理缓冲
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            proxyRes.headers['cache-control'] = 'no-cache, no-transform'
          })
        },
      },
    },
  },
})