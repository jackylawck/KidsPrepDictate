/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages 部署基底路徑
  base: '/KidsPrepDictate/',

  // 開發伺服器設定
  server: {
    // 開啟 host 允許區域網路存取，方便直接用 iPad 掃描 IP 進行本機實測
    host: true,
    port: 5173,
    strictPort: true,
  },

  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'assets',
    // 關閉 SourceMap 提升建置速度與保護原始碼
    sourcemap: false,
    
    // 提高 Chunk 警告上限 (處理大型字庫 JSON 載入時避免無謂警告)
    chunkSizeWarningLimit: 1000,
    cssCodeSplit: true,

    rollupOptions: {
      output: {
        // 手動程式碼分割 (Manual Chunking)：分離第三方套件與核心業務邏輯，優化快取命中率
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        }
      }
    }
  },

  // Esbuild 編譯器優化
  esbuild: {
    // 生產環境自動移除所有 console.log 與 debugger，保持終端機潔淨並防止資訊外洩
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
  },

  // Vitest 單元測試環境整合
  test: {
    globals: true,
    // 維持你現有的 Node 測試環境，確保與我們剛才處理的 DOM 隔離邏輯一致
    environment: 'node',
    include: ['tests/**/*.spec.ts', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary']
    }
  }
});
