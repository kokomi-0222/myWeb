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
          path: 'message',
          meta: { name: '消息管理' },
          component: () => import('@/views/space/Message.vue'),
        },
         {
          path: 'password',
          meta: { name: '修改密码' },
          component: () => import('@/views/space/Password.vue'),
        },
      ],
    },
  ],
})

export default router
