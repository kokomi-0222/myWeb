// utils/usePermission.js
import { ref, computed } from 'vue'

// 全局权限集合（Set 提高性能）
const userPermissions = ref(new Set())

/**
 * 初始化权限（传入权限数组）
 * @param {string[]} permissions - 权限字符串数组，如 ['user:create', 'post:audit']
 */
export function initPermissions(permissions = []) {

  // 清空旧权限，并用新数组创建 Set
  const permArray = Array.isArray(permissions) ? permissions : []
  userPermissions.value = new Set(permArray)
}

export function clearPermissions() {
  userPermissions.value = new Set()
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
    permissions: computed(() => Array.from(userPermissions.value))
  }
}
