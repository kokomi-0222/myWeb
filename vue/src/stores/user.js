import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  getUserInfo as apiGetUserInfo,
  login as apiLogin,
  register as apiRegister,
  updateProfile as apiUpdateProfile,
  updatePassword as apiUpdatePassword,
} from '@/api/user'
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
        return { success: false, message: res.msg || '登录失败，返回数据异常' }
      }
      if (setting.successCode.includes(res.code)) {
        token.value = res.data.token
        user.value = res.data.user
        roles.value = res.data.roles || []
        setAccessToken(res.data.token)
        initPermissions(res.data.permissions || [])
        return { success: true, data: res.data }
      }
      return { success: false, message: res.msg || '登录失败' }
    } catch (err) {
      console.error(err)
      return { success: false, message: res.msg }
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

  const updateProfile = async (formData) => {
    isLoading.value = true
    try {
      const res = await apiUpdateProfile(formData)
      if (setting.successCode.includes(res.code)) {
        // 更新成功后，自动重新拉取最新用户信息
        await getUserInfo()
        return { success: true, message: '保存成功' }
      } else {
        return { success: false, message: res.msg || '保存失败' }
      }
    } catch (err) {
      console.error(err)
      return { success: false, message: err.msg || '保存失败' }
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
    const res = await apiRegister(registerData)
    try {
      if (setting.successCode.includes(res.code)) {
        return { success: true, data: res.data }
      }
      return { success: false, message: res.msg || '注册失败' }
    } catch (err) {
      console.error(err)
      return { success: false, message: res.msg }
    }
  }

  // 更新密码
  const updatePassword = async (updateData) => {
    const res = await apiUpdatePassword(updateData)
    try {
      if (setting.successCode.includes(res.code)) {
        return { success: true, data: res.data }
      }
      return { success: false, message: res.msg || '更新密码失败' }
    } catch (err) {
      console.error(err)
      return { success: false, message: res.msg }
    }
  }


  // 刷新页面时自动获取用户信息
  if (token.value) {
    getUserInfo()
  }

  const roleOptions = [
    { role: 'admin', name: '管理员', color: '#e966b2' },
    { role: 'moderator', name: '版主', color: '#e966b2' },
    { role: 'editor', name: '编辑', color: '#e966b2' },
    { role: 'vip', name: '会员', color: '#e966b2' },
    { role: 'member', name: '普通用户', color: '#636161' },
    { role: 'guest', name: '访客', color: '#c0c4cc' },
  ]
  const primaryRole = computed(() => {
    return roleOptions.find((item) => item.role === user.value?.primaryRole)
  })

  return {
    user,
    roles,
    token,
    isLoading,
    isLogin,
    primaryRole,
    login,
    getUserInfo,
    logout,
    register,
    updateProfile,
    updatePassword,
  }
})
