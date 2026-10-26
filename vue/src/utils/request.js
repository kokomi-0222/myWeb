// src/utils/request.js
import axios from 'axios'
import setting from '@/config/setting'
import { getAccessToken, removeAccessToken } from '@/utils/accessToken'
import message from './message'
import { logError, logWarn } from './logger'

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

    // 邮箱未验证：这不是「操作失败」，而是「还没解锁发言」。
    // 不弹红色错误（会盖住验证弹窗），只广播一次让弹窗自己出来。
    if (setting.unverifiedCode && res.code == setting.unverifiedCode) {
      window.dispatchEvent(new CustomEvent('kokomi:unverified'))
      const err = new Error(res.msg || '验证邮箱后才能发布内容')
      err.unverified = true
      return Promise.reject(err)
    }

    message.error(res.msg)
    if (res.code == setting.invalidCode) {
      removeAccessToken()
      return Promise.reject(new Error('登录已过期，请重新登录'))
    }

    if (res.code == setting.noPermissionCode) {
      return Promise.reject(new Error('权限不足'))
    }

    // 被禁言（能登录、不能发内容）：提示已经在上面弹过了，
    // 这里额外广播一次，让 user store 重新拉用户信息，
    // 发布框 / 评论框会立刻换成「你已被禁言」的提示条。
    // 用事件而不是在这里直接 import store —— request ←→ store 是循环依赖，
    // 而且拦截器不该知道 store 长什么样。
    if (setting.mutedCode && res.code == setting.mutedCode) {
      window.dispatchEvent(new CustomEvent('kokomi:muted'))
      const err = new Error(res.msg || '你已被禁言，暂时无法发布内容')
      err.muted = true
      return Promise.reject(err)
    }

    // 走到这里的都是「非预期」的业务失败：登录过期(401)、权限不足(403) 属于正常流程，
    // 上面已经分别返回，不打印以免刷屏；其余打一条 warn，方便线上快速定位是哪个接口。
    logWarn('[请求失败]', {
      method: (response.config?.method || 'get').toUpperCase(),
      url: response.config?.url,
      code: res.code,
      msg: res.msg,
    })

    return Promise.reject(new Error(res.msg || '请求失败'))
  },
  (error) => {
    // 网络层 / HTTP 层异常（断网、超时、5xx、413…）：用户侧只弹一句提示，
    // 控制台打全上下文（地址、方法、状态码、响应体），不留「网络异常」这种无从排查的线索。
    logError('网络请求', error)

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
export default async function request(config) {
  // Mock 层只在开发环境按需加载：
  // 1. import.meta.env.DEV 在生产构建时会被替换为 false，整段被 tree-shake 掉，
  //    1331 行假数据不会进产物；
  // 2. 开发环境也是动态 import，只有真的开了 setting.mock 才加载对应 chunk。
  if (import.meta.env.DEV && setting.mock) {
    const { handleMockRequest } = await import('@/mocks/index')
    return handleMockRequest(config)
  }
  // 🔸 真实模式：走 axios + 拦截器
  return realService(config)
}

// ======================
//  快捷方法（保持兼容）
// ======================
export const get = (url, params = {}) => request({ method: 'GET', url, params })
export const post = (url, data = {}) => request({ method: 'POST', url, data })
export const put = (url, data = {}) => request({ method: 'PUT', url, data })
export const del = (url, params = {}) => request({ method: 'DELETE', url, params })
