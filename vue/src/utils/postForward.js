// 转发：确认 → 计数 +1 → 通知作者
//
// 两个入口共用（列表卡片底部「转发」、详情页右侧悬浮条），所以抽成模块函数。
// 没有独立的动态流，所以这里只做计数，不生成新内容。
import { ElMessageBox } from 'element-plus'
import message from '@/utils/message'
import { forwardPost } from '@/api/posts'
import { useUserStore } from '@/stores/user'
import { useUIStore } from '@/stores/ui'

// 正在提交中的帖子 id，防止连点重复计数
const pending = new Set()

/** 从多种后端字段名里取当前转发数 */
function readForwards(post) {
  const raw = post?.forward ?? post?.forwardCount ?? post?.forwardsCount ?? post?.forward_count ?? 0
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

/** 把新的转发数写回所有可能被读到的字段，避免不同组件读到旧值 */
function writeForwards(post, value) {
  post.forward = value
  post.forwardCount = value
  post.forwardsCount = value
  post.forward_count = value
}

/**
 * 弹确认框并执行转发。
 * @returns {Promise<boolean>} 是否真的转发成功
 */
export async function confirmAndForward(post) {
  if (!post?.id) return false

  const userStore = useUserStore()
  if (!userStore.isLogin) {
    message.warning('登录后才能转发')
    useUIStore().openLoginModal()
    return false
  }
  if (pending.has(post.id)) return false

  const title = String(post.title || '').trim()
  // 标题里已经带书名号（如《血月之下》序章）就别再套一层，否则变成《《…》》
  const hasQuote = /[《〈]/.test(title)
  const quoted = title ? (hasQuote ? title : `《${title}》`) : '这条帖子'

  try {
    await ElMessageBox.confirm(quoted, '转发帖子', {
      confirmButtonText: '转发',
      cancelButtonText: '取消',
      type: 'info',
      customClass: 'forward-confirm',
    })
  } catch {
    // 点了取消 / 关闭，静默返回
    return false
  }

  pending.add(post.id)
  try {
    await forwardPost(post.id)
    writeForwards(post, readForwards(post) + 1)
    message.success('转发成功')
    return true
  } catch (e) {
    // 错误提示已在 request 拦截器里统一处理
    return false
  } finally {
    pending.delete(post.id)
  }
}
