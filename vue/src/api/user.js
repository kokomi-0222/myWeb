// api/user.js
import request from '@/utils/request'
import setting from '@/config/setting'
import { encryptedData} from '@/utils/encrypt'

export async function login(data) {
  // 登录RSA加密
  if (setting.loginRSA) {
    data = await encryptedData(data)
    return request({
      url: '/user/login',
      method: 'post',
      data: {
        encryptedData: data,
      },
    })
  }

  return request({
    url: '/user/login',
    method: 'post',
    data,
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
