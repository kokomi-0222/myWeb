// utils/usePermission.js
import { ref, computed } from 'vue'

// 全局权限集合（Set 提高性能）
const userPermissions = ref(new Set())

/**
 * 从 JWT Token 初始化权限
 * @param {string} accessToken - JWT 字符串（Bearer token）
 */
export function initPermissions(accessToken) {
  try {
    // 解码 JWT payload（注意：只用于前端展示，不可信！）
    const payloadBase64 = accessToken.split('.')[1]
    const payloadJson = atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/'))
    const payload = JSON.parse(payloadJson)

    // 提取 permissions 字段（后端应包含此字段）
    const perms = Array.isArray(payload.permissions) ? payload.permissions : []
    userPermissions.value = new Set(perms)
  } catch (e) {
    console.warn('Failed to parse JWT permissions:', e)
    userPermissions.value = new Set()
  }
}

/**
 * 返回权限检查函数
 */
export function usePermission() {
  const hasPermission = (perm) => {
    return userPermissions.value.has(perm)
  }

  const hasAnyPermission = (perms) => {
    return perms.some(p => userPermissions.value.has(p))
  }

  return {
    hasPermission,
    hasAnyPermission,
    permissions: userPermissions // 用于调试
  }
}
