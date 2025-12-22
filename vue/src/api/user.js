// api/user.js
import request from '@/utils/request'
import setting from '@/config/setting'


export async function Login(data) {
  if (setting.loginRSA) {
    data = await encryptedData(data)
  }
  return request({
    url: '/login',
    method: 'POST',
    data,
  })
}


export function getUserInfo() {
  return request({
    url: '/user/info',
    method: 'GET'
  })
}
