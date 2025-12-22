// src/utils/request.js
import axios from 'axios'
import setting from '@/config/setting'
import { getAccessToken, removeAccessToken } from '@/utils/accessToken'
import { ElMessage } from 'element-plus' // 如果你用 Element Plus
// import { message } from 'ant-design-vue' // 如果你用 Ant Design Vue
// 1. 创建 axios 实例
const service = axios.create({
  baseURL: setting.baseURL,
  timeout: setting.requestTimeout,
  headers: {
    'Content-Type': setting.contentType
  }
})

// 2. 请求拦截器
service.interceptors.request.use(
  (config) => {
    // 获取 token（从 store 或 localStorage）
    let token = getAccessToken()
    // 白名单路由不加 token（如登录）
    const isWhiteList = setting.routesWhiteList.some(path =>
      config.url?.startsWith(path)
    )

    if (token && !isWhiteList) {
      config.headers.Authorization = `Bearer ${token}` // 或根据后端要求调整
    }

    return config
  },
  (error) => {
    console.error('请求拦截错误:', error)
    return Promise.reject(error)
  }
)

// 3. 响应拦截器
service.interceptors.response.use(
  (response) => {
    const res = response.data

    // 判断业务逻辑是否成功（根据 successCode）
    if (setting.successCode.includes(res.code)) {
      return res // 直接返回 data
    }

    // 特殊状态码处理
    if (res.code === setting.invalidCode) {
      // 登录失效：清空用户信息并跳转登录页
      removeAccessToken()
      // 这里可以调用 Pinia 的 clearUser()
      // 但为解耦，我们只做跳转（或通过事件通知）
      ElMessage.error('登录已过期，请重新登录')
      //window.location.href = '/login'
      return Promise.reject(new Error('登录失效'))
    }

    if (res.code === setting.noPermissionCode) {
      ElMessage.error('权限不足')
      return Promise.reject(new Error('无权限'))
    }

    // 其他业务错误
    ElMessage.error(res.message || '请求失败')
    return Promise.reject(new Error(res.message || 'Error'))
  },
  (error) => {
    // 网络错误 / 超时等
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      ElMessage.error('请求超时')
    } else if (!window.navigator.onLine) {
      ElMessage.error('网络连接失败')
    } else {
      ElMessage.error(error.message || '请求异常')
    }
    return Promise.reject(error)
  }
)

// 4. 导出 request 方法（支持泛型，TS 友好）
/**
 * 通用请求方法
 * @template T - 响应数据类型
 * @param {import('axios').AxiosRequestConfig} config
 * @returns {Promise<T>}
 */
export default function request(config) {
  return service(config)
}

// 5. 快捷方法（可选）
export const get = (url, params = {}) => request({ method: 'GET', url, params })
export const post = (url, data = {}) => request({ method: 'POST', url, data })
export const put = (url, data = {}) => request({ method: 'PUT', url, data })
export const del = (url, params = {}) => request({ method: 'DELETE', url, params })
