import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@/assets/css/global.css'
import '@/assets/css/theme.css'
// ElMessageBox 是通过 JS API 调起来的，不经过 unplugin-vue-components 的按需样式注入，
// 所以必须在入口显式引入 EP 的基础样式。否则在「没渲染过 PostCard」的页面上
// （比如后台话题页）会缺 .el-overlay{position:fixed}，确认弹框掉进文档流、
// 出现在视口下方，用户看起来就是「点了删除没反应」。
import 'element-plus/theme-chalk/el-overlay.css'
import 'element-plus/theme-chalk/el-message-box.css'
import 'element-plus/theme-chalk/el-button.css'
import 'element-plus/theme-chalk/el-input.css'
import 'element-plus/theme-chalk/el-icon.css'
import '@/assets/css/message.css'
import '@/assets/css/message-box.css'
import App from './App.vue'
import router from './router'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
