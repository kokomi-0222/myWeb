// api/user.js
import request from '@/utils/request'
import setting from '@/config/setting'
import { encryptedData } from '@/utils/encrypt'

export async function login(data, captchaKey, captchaCode) {
  // 登录RSA加密
  if (setting.loginRSA) {
    data = await encryptedData(data)
    return request({
      url: '/user/login',
      method: 'post',
      data: {
        encryptedData: data,
        captchaKey: captchaKey || '',
        captchaCode: captchaCode || '',
      },
    })
  }
  // 未开启 RSA 时也要发请求（原来缺少 return，函数返回 undefined，表现为「点击无反应/超时」）
  return request({
    url: '/user/login',
    method: 'post',
    data: {
      encryptedData: JSON.stringify(data),
      captchaKey: captchaKey || '',
      captchaCode: captchaCode || '',
    },
  })
}

export async function register(data, captchaKey, captchaCode) {
  if (setting.loginRSA) {
    data = await encryptedData(data)
    return request({
      url: '/user/register',
      method: 'post',
      data: {
        encryptedData: data,
        captchaKey: captchaKey || '',
        captchaCode: captchaCode || '',
      },
    })
  }
  return request({
    url: '/user/register',
    method: 'post',
    data: {
      encryptedData: JSON.stringify(data),
      captchaKey: captchaKey || '',
      captchaCode: captchaCode || '',
    },
  })
}

/** 给当前登录用户的邮箱发验证码（60 秒一次、每小时 5 封） */
/**
 * 发邮箱验证码。
 * @param {string} [email] 要绑定的邮箱；不传就用账号上已有的（老账号）
 */
export function sendVerifyCode(email) {
  return request({
    url: '/user/verify/send',
    method: 'post',
    data: email ? { email } : {},
  })
}

/**
 * 提交邮箱验证码：通过后邮箱绑定到账号，游客会顺带升成普通用户（能评论）
 * @param {string} code 6 位验证码
 * @param {string} [email] 要绑定的邮箱；不传就用账号上已有的
 */
export function confirmVerifyCode(code, email) {
  return request({
    url: '/user/verify/confirm',
    method: 'post',
    data: email ? { email, code } : { code },
  })
}

export function logout() {
  return request({
    url: '/user/logout',
    method: 'post',
  })
}

export function getUserInfo() {
  return request({
    url: '/user/info',
    method: 'get',
  })
}

export function updateProfile(data) {
  return request({
    url: '/user/update',
    method: 'post',
    data,
  })
}

export function getUserPermissions() {
  return request({
    url: '/user/permissions',
    method: 'get',
  })
}

// 他人主页的公开资料（无需登录）
export function getUserProfile(id) {
  return request({
    url: `/user/profile/${id}`,
    method: 'get',
  })
}

// 全站统计：帖子数 / 用户数 / 评论数
export function getSiteStats() {
  return request({
    url: '/post/stats',
    method: 'get',
  })
}

export async function updatePassword(data) {
  if (setting.loginRSA) {
    data = await encryptedData(data)
    return request({
      url: '/user/password',
      method: 'post',
      data: {
        encryptedData: data,
      },
    })
  }
  return request({
    url: '/user/password',
    method: 'post',
    data: {
      encryptedData: JSON.stringify(data),
    },
  })
}
