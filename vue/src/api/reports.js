import request from '@/utils/request'

/** 举报理由字典（code -> 中文），后端维护，前端不写死 */
export function getReportReasons() {
  return request({
    url: '/report/reasons',
    method: 'get'
  })
}

/**
 * 提交举报
 * @param {{targetType: 'post'|'comment'|'user', targetId: number, reasonCode: string, detail?: string}} data
 */
export function createReport(data) {
  return request({
    url: '/report',
    method: 'post',
    data
  })
}

/** 我在某类对象上还没处理完的举报目标 id 列表 */
export function getMyReportedIds(targetType) {
  return request({
    url: '/report/mine',
    method: 'get',
    params: { targetType }
  })
}

// ---------------------------------------------------------------- 后台

export function getReportList(params) {
  return request({
    url: '/admin/report/list',
    method: 'get',
    params
  })
}

export function getReportDetail(id) {
  return request({
    url: `/admin/report/${id}`,
    method: 'get'
  })
}

export function handleReport(id, data) {
  return request({
    url: `/admin/report/${id}/handle`,
    method: 'post',
    data
  })
}

export function getPendingReportCount() {
  return request({
    url: '/admin/report/pending-count',
    method: 'get'
  })
}
