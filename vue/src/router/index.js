import { createRouter, createWebHistory } from 'vue-router'
import { watch } from 'vue'
import { useUserStore } from '@/stores/user'
import { useUIStore } from '@/stores/ui'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      meta: { title: '主页' },
      component: () => import('@/views/Index.vue'),
    },
    {
      path: '/post/:id',
      meta: { title: '帖子详情' },
      component: () => import('@/views/PostDetail.vue'),
    },
    {
      path: '/space',
      meta: { title: '个人空间', requiresAuth: true },
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

router.beforeEach(async (to) => {
  if (to.meta.requiresAuth) {
    const userStore = useUserStore()

    // 等待 store 初始化完成（页面刷新时异步拉取用户信息）
    if (userStore.isLoading) {
      await new Promise((resolve) => {
        const stop = watch(() => userStore.isLoading, (loading) => {
          if (!loading) { stop(); resolve() }
        })
      })
    }

    if (!userStore.isLogin) {
      // 未登录，重定向到首页并弹出登录框
      useUIStore().openLoginModal()
      return '/'
    }
  }
})

export default router
