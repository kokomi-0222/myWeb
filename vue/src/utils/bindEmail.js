// utils/bindEmail.js
import { ElMessageBox } from 'element-plus'
import router from '@/router'
import { useUIStore } from '@/stores/ui'
import { useUserStore } from '@/stores/user'
import { message } from '@/utils/message'

/**
 * 绑定邮箱的唯一去处：个人中心 → 账号管理。
 *
 * 以前是一个全局弹窗（VerifyEmailModal），后来搬进了账号页：
 *   1. 弹窗一关就没地方确认「我绑的是哪个邮箱」；
 *   2. 解绑、换绑这类管理动作，弹窗里放不下；
 *   3. 页面里能写清楚「绑定/解绑分别意味着什么」。
 * 所以全站三个入口（发布框提示条、评论框、回复框）统一跳过去，
 * 带 ?bind=1 让目标页自动展开绑定面板。
 */
export const BIND_EMAIL_PATH = '/space/account'

/** 直接跳到账号页并展开绑定面板（用户主动点的按钮用它） */
export function goBindEmail() {
  const userStore = useUserStore()
  const uiStore = useUIStore()

  // 没登录就先登录 —— 绑定接口要 token，跳过去也只会看到「登录状态已失效」
  if (!userStore.token) {
    message.info('登录后才能绑定邮箱')
    uiStore.openLoginModal()
    return
  }

  // 已经绑好了就别折腾用户：可能是在别的标签页绑完回来的
  if (userStore.user?.email && userStore.user?.emailVerified !== false) {
    message.info('这个账号已经绑好邮箱了')
    return
  }

  if (router.currentRoute.value.path === BIND_EMAIL_PATH) {
    // 已经在账号页：改 query 不会触发组件重建，直接广播一次让页面展开面板
    window.dispatchEvent(new CustomEvent('kokomi:open-bind'))
    return
  }
  router.push({ path: BIND_EMAIL_PATH, query: { bind: '1' } })
}

let asking = false

/**
 * 被后端 507 拦下时用：先问一句再跳。
 *
 * 为什么不直接跳 —— 507 往往发生在「写完一段评论/帖子点发布」的瞬间，
 * 直接换页会把刚写的内容一起丢掉，用户会更恼火。确认框里那个「稍后再说」
 * 让他能留在原地复制一下自己写的东西。
 */
export function askBindEmail(reason = '绑定邮箱后才能发帖、评论和回复') {
  if (asking) return
  const userStore = useUserStore()
  if (!userStore.token) return // 没登录的话 507 不会出现，真出现了也没法绑

  asking = true
  ElMessageBox.confirm(reason + '。现在去个人中心绑定吗？', '需要绑定邮箱', {
    confirmButtonText: '去绑定',
    cancelButtonText: '稍后再说',
    type: 'info',
  })
    .then(() => goBindEmail())
    .catch(() => {})
    .finally(() => {
      asking = false
    })
}
