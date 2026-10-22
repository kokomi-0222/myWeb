// src/utils/request.js
import axios from 'axios'
import setting from '@/config/setting'
import { getAccessToken, removeAccessToken } from '@/utils/accessToken'
import { handleMockRequest } from '@/mocks/index'
import message from './message'

// ======================
//  真实请求实例（仅在非 mock 时使用）
// ======================
const realService = axios.create({
  baseURL: setting.baseURL,
  timeout: setting.requestTimeout,
  headers: {
    'Content-Type': setting.contentType,
  },
})

// 请求拦截器（只对真实请求生效）
realService.interceptors.request.use(
  (config) => {
    const isWhiteList = setting.routesWhiteList.some((path) => config.url?.startsWith(path))
    const token = getAccessToken()
    if (token && !isWhiteList) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

// 响应拦截器（只对真实请求生效）
realService.interceptors.response.use(
  (response) => {
    const res = response.data
    
    if (setting.successCode.includes(res.code)) {
      return res
    }
    message.error(res.msg)
    if (res.code == setting.invalidCode) {
      removeAccessToken()
      return Promise.reject(new Error('登录已过期，请重新登录'))
    }

    if (res.code == setting.noPermissionCode) {
      return Promise.reject(new Error('权限不足'))
    }
    
    return Promise.reject(new Error(res.msg || '请求失败'))
  },
  (error) => {
    // 413：请求体超过服务器（Nginx）允许的大小，通常是上传了过大的图片。
    // 这种情况必须给出准确提示，否则用户只会看到含糊的「网络异常」。
    if (error.response?.status === 413) {
      message.error(`图片大小不要超过 ${setting.imageSizeText}`)
      // 打上标记，调用方不要再弹一次「上传失败」
      const err = new Error('文件过大')
      err.handled = true
      return Promise.reject(err)
    }
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout') || error.message === 'Network Error') {
      message.error('请求超时')
    } else if (!window.navigator.onLine) {
      message.error('网络连接失败')
    } else {
      message.error('网络异常')
    }
    return Promise.reject(error)
  },
)

// ======================
//  智能请求入口（根据 setting.mock 自动选择）
// ======================
/**
 * 通用请求方法
 * @template T
 * @param {import('axios').AxiosRequestConfig} config
 * @returns {Promise<T>}
 */
export default function request(config) {
  if (setting.mock) {
    // 🔸 Mock 模式：不走网络，直接返回模拟数据
    return handleMockRequest(config)
  } else {
    // 🔸 真实模式：走 axios + 拦截器
    return realService(config)
  }
}

// ======================
//  快捷方法（保持兼容）
// ======================
export const get = (url, params = {}) => request({ method: 'GET', url, params })
export const post = (url, data = {}) => request({ method: 'POST', url, data })
export const put = (url, data = {}) => request({ method: 'PUT', url, data })
export const del = (url, params = {}) => request({ method: 'DELETE', url, params })
