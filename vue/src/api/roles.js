// api/roles.js —— 角色字典（公开）
import request from '@/utils/request'

/**
 * 角色字典：编码 → 中文名。
 * 前台身份标签靠它把 roleCode 翻成中文，免登录可访问。
 */
export function getRoleOptions() {
  return request({
    url: '/role/list',
    method: 'get',
  })
}
