import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getMyReportedIds, getReportReasons } from '@/api/reports'
import { getAccessToken } from '@/utils/accessToken'

/**
 * 举报弹窗的全局状态。
 *
 * 为什么放 store 而不是每个组件各挂一份弹窗：帖子的「更多」菜单、评论、用户主页
 * 三个地方都要能打开同一个弹窗，放在 App.vue 挂一次最省事，也避免样式重复。
 */
export const useReportStore = defineStore('report', () => {
  const visible = ref(false)

  /** 当前举报目标 { type: 'post'|'comment'|'user', id, label } */
  const target = ref(null)

  /** code -> 中文名 */
  const reasons = ref({})

  const loaded = ref(false)

  const reasonList = computed(() =>
    Object.entries(reasons.value).map(([code, label]) => ({ code, label }))
  )

  async function loadReasons() {
    if (loaded.value) return
    try {
      const res = await getReportReasons()
      if (res.code === 200 && res.data) {
        reasons.value = res.data
        loaded.value = true
      }
    } catch (err) {
      // 字典拉不到就让弹窗显示空列表，用户仍能选「其他」
      console.warn('获取举报理由失败:', err)
    }
  }

  /**
   * 打开弹窗。
   * @param {{type: string, id: number, label?: string}} t `label` 是弹窗顶部显示的对象描述
   */
  function open(t) {
    if (!getAccessToken()) {
      // 未登录不弹举报框，交给调用方去开登录框
      return false
    }
    target.value = t
    visible.value = true
    loadReasons()
    return true
  }

  function close() {
    visible.value = false
    target.value = null
  }

  // ---------------------------------------------------------------- 已举报标记
  // 列表里同一个帖子会渲染很多次 PostCard，所以这里自己带一个「只拉一次」的闸门，
  // 不能每个卡片挂载时都发一次请求。
  const pendingIds = ref({ post: new Set(), comment: new Set(), user: new Set() })
  const mineLoaded = ref({ post: false, comment: false, user: false })
  let minePromise = null

  async function loadMine(targetType = 'post') {
    if (!getAccessToken()) return
    // 已经拉过就别再问一遍（列表里有几十个 PostCard，每个都会调这里）
    if (mineLoaded.value[targetType]) return
    if (minePromise) return minePromise
    minePromise = getMyReportedIds(targetType)
      .then((res) => {
        if (res.code === 200 && Array.isArray(res.data)) {
          pendingIds.value = { ...pendingIds.value, [targetType]: new Set(res.data.map(Number)) }
          mineLoaded.value = { ...mineLoaded.value, [targetType]: true }
        }
      })
      .catch(() => {
        // 拉不到就不显示「已举报」，用户点了重复举报后端也会拦
      })
      .finally(() => {
        minePromise = null
      })
    return minePromise
  }

  function hasReported(targetType, id) {
    return pendingIds.value[targetType]?.has(Number(id)) || false
  }

  function markReported(targetType, id) {
    const set = new Set(pendingIds.value[targetType] || [])
    set.add(Number(id))
    pendingIds.value = { ...pendingIds.value, [targetType]: set }
  }

  return {
    visible,
    target,
    reasons,
    reasonList,
    loaded,
    open,
    close,
    loadReasons,
    loadMine,
    hasReported,
    markReported
  }
})
