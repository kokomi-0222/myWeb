import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      meta: { title: '主页' },
      component: () => import('@/views/Index.vue'),
    },
    {
      path: '/space',
      meta: { title: '个人空间' },
      component: () => import('@/views/space/Index.vue'),
      children: [
        {
          path: 'home',
          meta: { name: '首页' },
          component: () => import('@/views/space/Home.vue'),
        },
        {
          path: 'account',
          meta: { name: '账户信息' },
          component: () => import('@/views/space/Account.vue'),
        },
        {
          path: 'posts',
          meta: { name: '帖子列表' },
          component: () => import('@/views/space/Posts.vue'),
        },
      ],
    },
  ],
})

export default router
