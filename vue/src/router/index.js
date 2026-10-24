import { createRouter, createWebHistory } from 'vue-router'
import { watch } from 'vue'
import { useUserStore } from '@/stores/user'
import { useUIStore } from '@/stores/ui'
import { usePermission } from '@/utils/usePermission'
import message from '@/utils/message'

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
      // 他人主页：公开可访问，不需要登录
      path: '/user/:id',
      meta: { title: '用户主页' },
      component: () => import('@/views/UserProfile.vue'),
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
        {
          // 用户管理已搬进 /admin 后台。留一条重定向，
          // 免得收藏过 /space/users 的人（包括站长自己）点到 404。
          path: 'users',
          redirect: '/admin/users',
        },
      ],
    },
    {
      // 后台管理：独立布局（左侧导航 + 顶栏），不复用前台顶栏与横幅。
      // 整个分区只认一个权限 user:manage，守卫和菜单都用它。
      path: '/admin',
      meta: { title: '管理后台', requiresAuth: true, permission: 'user:manage' },
      component: () => import('@/views/admin/Index.vue'),
      redirect: '/admin/dashboard',
      children: [
        {
          path: 'dashboard',
          meta: { name: '概览' },
          component: () => import('@/views/admin/Dashboard.vue'),
        },
        {
          path: 'users',
          meta: { name: '用户管理' },
          component: () => import('@/views/admin/Users.vue'),
        },
        {
          path: 'topics',
          meta: { name: '话题管理' },
          component: () => import('@/views/admin/Topics.vue'),
        },
        {
          // 角色权限：建角色、给角色勾权限，再回「用户管理」把角色点给人
          path: 'roles',
          meta: { name: '角色权限' },
          component: () => import('@/views/admin/Roles.vue'),
        },
      ],
    },
    {
      // 兜底：未匹配的路径走 404，避免白屏
      path: '/:pathMatch(.*)*',
      meta: { title: '页面不存在' },
      component: () => import('@/views/NotFound.vue'),
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

    // 权限守卫：即使是登录用户，直接敲 /admin 地址也会被踢回首页
    if (to.meta.permission) {
      const { hasPermission } = usePermission()
      if (!hasPermission(to.meta.permission)) {
        message.warning('没有访问管理后台的权限')
        return '/'
      }
    }
  }
})

export default router
