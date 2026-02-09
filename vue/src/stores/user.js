import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getUserInfo as apiGetUserInfo, login as apiLogin } from '@/api/user'
import setting from '@/config/setting'
import { getAccessToken, setAccessToken, removeAccessToken } from '@/utils/accessToken'
import { initPermissions } from '@/utils/usePermission.js'

export const useUserStore = defineStore('user', () => {
  const user = ref(null)
  const roles = ref([])
  const token = ref(getAccessToken())
  const isLoading = ref(false) //加载状态

  // 真正的登录状态：token 存在 且 加载完成 且 user 存在
  const isLogin = computed(() => {
    return !isLoading.value && !!token.value && !!user.value
  })

  // 登录
  const login = async (loginData) => {
    isLoading.value = true
    try {
      const res = await apiLogin(loginData)
      if (!res.data) {
        return { success: false, message: '登录失败，返回数据异常' }
      }
      if (setting.successCode.includes(res.code)) {
        token.value = res.data.token
        user.value = res.data.user
        roles.value = res.data.roles || []
        setAccessToken(res.data.token)
        initPermissions(res.data.permissions || [])
        return { success: true, data: res.data }
      }
      return { success: false, message: res.message || '登录失败' }
    } catch (err) {
      console.error(err)
      return { success: false, message: '网络异常或服务器错误' }
    } finally {
      isLoading.value = false
    }
  }

  // 获取用户信息
  const getUserInfo = async () => {
    if (!token.value) {
      return { success: false, message: '未登录' }
    }

    isLoading.value = true 
    try {
      const res = await apiGetUserInfo()
      if (!res.data) {
        return { success: false, message: '用户信息格式错误' }
      }
      if (setting.successCode.includes(res.code)) {
        console.log('getUserInfo', res.data)
        user.value = res.data.user
        roles.value = res.data.roles || []
        initPermissions(res.data.permissions || [])
        return { success: true, data: res.data }
      } else {
        return { success: false, message: res.message || '获取用户信息失败' }
      }
    } catch (err) {
      console.error(err)
      return { success: false, message: '获取用户信息失败' }
    } finally {
      isLoading.value = false 
    }
  }

  //  登出
  const logout = async () => {
    removeAccessToken()
    user.value = null
    token.value = null
    roles.value = []
    initPermissions([])
    return { success: true }
  }

  // 注册
  const register = async (registerData) => {
    throw new Error('register 接口暂未实现')
  }

  // 刷新页面时自动获取用户信息
  if (token.value) {
    getUserInfo()
  }

  return {
    user,
    roles,
    token,
    isLoading,
    isLogin,
    login,
    getUserInfo,
    logout,
    register
  }
})