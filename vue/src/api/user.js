// api/user.js
import request from '@/utils/request'
import setting from '@/config/setting'


export async function login(data) {
  if (setting.loginRSA) {
    data = await encryptedData(data)
  }
  return request({
    url: '/user/login',
    method: 'post',
    data,
  })
}

export function getUserInfo(accessToken) {
  return request({
    url: '/user/info',
    method: 'post',
    data: {
      [setting.tokenName]: accessToken,
    },
  })
}

export function logout() {
  return request({
    url: '/user/logout',
    method: 'post',
  })
}

export function register() {
  return request({
    url: '/user/register',
    method: 'post',
  })
}

export function getUserPermissions() {
  return request({
    url: '/user/permissions',
    method: 'get'
  })
}