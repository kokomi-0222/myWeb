import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      meta: { title: '主页' },
      component: () => import('@/views/Index.vue'),
    },


  ],
})

export default router
