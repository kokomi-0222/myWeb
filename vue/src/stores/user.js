import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getUserInfo as apiGetUserInfo, Login as apiLogin } from '@/api/user'
import setting from '@/config/setting'
import { getAccessToken, setAccessToken, removeAccessToken } from '@/utils/accessToken'
import { initPermissions } from '@/utils/usePermission.js'
import { ElMessage } from 'element-plus'
/**
 * currentUser 用户信息
 *    id 用户id
 *    username 用户名 
 *    age 年龄
 *    email 邮箱
 *    avatar 头像
 *    phone 手机
 *    sex 性别
 *    role 角色
 *    permissions 权限
 */

/* 
token:
{
  "sub": "1001",                     // 用户唯一 ID（标准字段）
  "username": "alice",               // 用户名（用于展示）
  "role": "admin",                   // 角色标识（可选，但建议保留）
  "permissions": [                   // 【关键】前端权限控制的核心！
    "post:create",
    "post:edit",
    "post:delete",
    "user:block",
    "comment:report"
  ],
  "iat": 1735689600,                 // 签发时间（标准）
  "exp": 1735693200                  // 过期时间（标准）
}
 */
//选项式API
export const useUserStore = defineStore('user', () => {
    const currentUser = ref(null)
    const token = ref(getAccessToken())
    const isLogin = computed(() => !!currentUser.value)

    const login = async (loginData) => {
        const res = await apiLogin(loginData)
        if (setting.successCode.includes(res.code)) {
            // 保存到stores
            token.value = res.data.token
            currentUser.value = res.data.currentUser
            //持久化存储
            setAccessToken(res.data.token)
            initPermissions(res.data.token)
            ElMessage.success('登录成功！')
        } else {
            ElMessage.error(res.message)
        }
    }

    const getUserInfo = () => {
        apiGetUserInfo().then(res => {
            if (setting.successCode.includes(res.code)) {
                currentUser.value = res.data.currentUser
            } else {
                ElMessage.error(res.message)
            }
        })
    }

    const logout = () => {
        removeAccessToken()
        currentUser.value = null
        token.value = null
        initPermissions('')
        ElMessage.success('退出登录成功！')
    }

    const register = async (registerData) => {

    }

    return { currentUser, token, isLogin, login, getUserInfo, logout, register }
})




