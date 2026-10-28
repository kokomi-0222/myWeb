// api/admin.js —— 后台管理接口（概览 / 用户 / 话题）
import request from '@/utils/request'

/* ---------------- 概览 ---------------- */

/** 总数、今日新增、最近注册用户、最新帖子 */
export function getAdminStats() {
  return request({
    url: '/admin/stats',
    method: 'get',
  })
}

/* ---------------- 用户 ---------------- */

/** 用户列表：keyword 匹配账号 / 昵称 / 邮箱 */
export function getAdminUsers(params) {
  return request({
    url: '/admin/users',
    method: 'get',
    params,
  })
}

/** 可选角色字典（role 表） */
export function getAdminRoles() {
  return request({
    url: '/admin/roles',
    method: 'get',
  })
}

/** 整体覆盖某个用户的角色 */
export function updateUserRoles(userId, roles) {
  return request({
    url: `/admin/user/${userId}/roles`,
    method: 'put',
    data: { roles },
  })
}

/** 设置某个用户的名字颜色 / 身份标签底色（空值 = 恢复默认） */
export function updateUserStyle(userId, data) {
  return request({
    url: `/admin/user/${userId}/style`,
    method: 'put',
    data,
  })
}

/**
 * 处罚用户。
 *
 * @param {number} userId
 * @param {{ level: 1 | 2, days: number, reason?: string }} payload
 *        level 1 = 禁言（能登录，不能发帖评论），2 = 封号（不能登录）；
 *        days 正数按天，-1 表示永久
 */
export function punishUser(userId, payload) {
  return request({
    url: `/admin/user/${userId}/punish`,
    method: 'post',
    data: payload,
  })
}

/**
 * 解除处罚（禁言和封号都走这里）。
 * 永久处罚没有到期时间，只能靠这个接口撤销。
 */
export function unbanUser(userId) {
  return request({
    url: `/admin/user/${userId}/unban`,
    method: 'post',
  })
}

/**
 * 手动把某个用户的邮箱标记为已验证。
 * 用途：SMTP 出故障、或用户是老手机号账号没有邮箱时，别让人卡死在「发不了内容」。
 */
export function verifyUserEmail(userId) {
  return request({
    url: `/admin/user/${userId}/verify`,
    method: 'post',
  })
}

/**
 * 代为注销某个账号（不可逆）。
 *
 * 只给「用户发邮件申请、自己不会操作」兜底。注销之后他的帖子全部变成
 * 「已注销用户」，所以调用方必须先让管理员手打一遍目标用户名 —— 别做成一点就生效。
 * 后端另有两道闸：不能注销自己、不能注销持 user:manage 的账号。
 */
export function deactivateUser(userId) {
  return request({
    url: `/admin/user/${userId}/deactivate`,
    method: 'post',
  })
}

/* ---------------- 角色权限 ---------------- */

/** 角色列表：每个角色带已勾选的权限码 + 名下用户数 */
export function getAdminRoleList() {
  return request({
    url: '/admin/role/list',
    method: 'get',
  })
}

/** 权限字典（按 permGroup 分组展示） */
export function getAdminPermissionList() {
  return request({
    url: '/admin/permission/list',
    method: 'get',
  })
}

/** 新建角色 */
export function createAdminRole(data) {
  return request({
    url: '/admin/role',
    method: 'post',
    data,
  })
}

/** 修改角色的名字 / 说明 / 权限（编码不可改） */
export function updateAdminRole(roleCode, data) {
  return request({
    url: `/admin/role/${roleCode}`,
    method: 'put',
    data,
  })
}

/** 删除角色（内置角色、还有人用的会被后端拒绝） */
export function deleteAdminRole(roleCode) {
  return request({
    url: `/admin/role/${roleCode}`,
    method: 'delete',
  })
}

/* ---------------- 话题 ---------------- */

/** 话题列表：含「帖子用过但没登记」的兜底项（registered=false） */
export function getAdminTopics() {
  return request({
    url: '/admin/topics',
    method: 'get',
  })
}

/** 新建话题 */
export function createAdminTopic(data) {
  return request({
    url: '/admin/topic',
    method: 'post',
    data,
  })
}

/** 改展示名 / 颜色 / 排序 */
export function updateAdminTopic(id, data) {
  return request({
    url: `/admin/topic/${id}`,
    method: 'put',
    data,
  })
}

/** 删除话题（有帖子时后端会拒绝） */
export function deleteAdminTopic(id) {
  return request({
    url: `/admin/topic/${id}`,
    method: 'delete',
  })
}
