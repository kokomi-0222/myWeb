import request from '@/utils/request'

// 我的通知列表
export function getNotifications(pageNum = 1, pageSize = 20) {
  return request({
    url: '/notifications',
    method: 'get',
    params: { pageNum, pageSize },
  })
}

// 未读数量（顶栏 / 侧栏红点用）
export function getUnreadCount() {
  return request({
    url: '/notifications/unread-count',
    method: 'get',
  })
}

// 全部标为已读
export function markAllRead() {
  return request({
    url: '/notifications/read-all',
    method: 'post',
  })
}

// 单条标为已读
export function markRead(id) {
  return request({
    url: `/notifications/${id}/read`,
    method: 'post',
  })
}
