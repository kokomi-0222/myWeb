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
  server: {
    port: 5173,        // 
    open: true,        // 
    host: 'localhost'  // 可选：指定 host
  },
})
