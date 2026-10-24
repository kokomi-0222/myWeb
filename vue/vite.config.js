import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
/* import vueDevTools from 'vite-plugin-vue-devtools' */
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    //vueDevTools(),
    AutoImport({
      resolvers: [ElementPlusResolver()],
    }),
    Components({
      resolvers: [ElementPlusResolver()],
      dirs: ['src/components'], // 组件目录
      extensions: ['vue'],
      dts: true, // 自动生成 components.d.ts（TypeScript 用户强烈建议开启）
      include: [/\.vue$/, /\.vue\?vue/],
    }),
  ],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },

  // 生产构建剔除「纯调试」输出，避免 F12 控制台被业务日志刷屏。
  // - 只处理 log/info/debug 三类，warn/error 是异常信号，一律保留；
  // - 需要「上线后仍然要打印」的内容（如控制台欢迎语），走 src/utils/logger.js 的 log()，
  //   它用 .apply 间接调用，不在 pure 的匹配范围内，不会被删。
  esbuild: {
    drop: ['debugger'],
    pure: ['console.log', 'console.info', 'console.debug'],
  },
  server: {
    port: 5173,        // 
    open: true,        // 
    host: 'localhost'  // 可选：指定 host
  },
})
