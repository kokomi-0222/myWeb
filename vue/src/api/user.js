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
