import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getUnreadCount } from '@/api/notification'
import { getAccessToken } from '@/utils/accessToken'

/**
 * 未读通知数。侧栏「消息管理」的红点和消息页共用这一份状态，
 * 避免两个地方各拉一次接口、数字还对不上。
 */
export const useNotificationStore = defineStore('notification', () => {
  const unread = ref(0)

  const setUnread = (n) => {
    unread.value = Math.max(0, Number(n) || 0)
  }

  const fetchUnread = async () => {
    // 未登录时没有通知，也避免无谓的 401
    if (!getAccessToken()) {
      unread.value = 0
      return 0
    }
    try {
      const res = await getUnreadCount()
      if (res.code === 200) {
        setUnread(res.data)
      }
    } catch (err) {
      // 拉取失败不影响页面，保留上一次的数字
      console.warn('获取未读数失败:', err)
    }
    return unread.value
  }

  const clear = () => {
    unread.value = 0
  }

  return { unread, setUnread, fetchUnread, clear }
})
