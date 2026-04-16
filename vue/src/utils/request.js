// src/utils/request.js
import axios from 'axios'
import setting from '@/config/setting'
import { getAccessToken, removeAccessToken } from '@/utils/accessToken'
import { handleMockRequest } from '@/mocks/index'
import message from './message'

// ======================
// 1. 真实请求实例（仅在非 mock 时使用）
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

    if (res.code == setting.invalidCode) {
      removeAccessToken()
      return res//Promise.reject(new Error('登录已过期，请重新登录'))
    }

    if (res.code == setting.noPermissionCode) {
      return res //Promise.reject(new Error('权限不足'))
    }

    return Promise.reject(new Error(res.message || '请求失败'))
  },
  (error) => {
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      message.error('请求超时')
    } else if (!window.navigator.onLine) {
      message.error('网络连接失败')
    } else {
      message.error(error.message || '请求异常')
    }
    return Promise.reject(error)
  },
)

// ======================
// 3. 智能请求入口（根据 setting.mock 自动选择）
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
// 4. 快捷方法（保持兼容）
// ======================
export const get = (url, params = {}) => request({ method: 'GET', url, params })
export const post = (url, data = {}) => request({ method: 'POST', url, data })
export const put = (url, data = {}) => request({ method: 'PUT', url, data })
export const del = (url, params = {}) => request({ method: 'DELETE', url, params })
