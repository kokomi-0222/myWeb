import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getUserInfo as apiGetUserInfo, login as apiLogin } from '@/api/user'
import setting from '@/config/setting'
import { getAccessToken, setAccessToken, removeAccessToken } from '@/utils/accessToken'
import { initPermissions } from '@/utils/usePermission.js'


/**
 * user 用户信息
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
  "permissions": [        
    //帖子模块           
    "post:create",
    "post:edit",
    "post:delete",
    //用户模块
    "user:block",
    //评论模块
    "comment:report"
  ],
  "iat": 1735689600,                 // 签发时间（标准）
  "exp": 1735693200                  // 过期时间（标准）
}
 */

export const useUserStore = defineStore('user', () => {
    const user = ref(null)
    const token = ref(getAccessToken())
    const isLogin = computed(() => !!user.value)

    const login = async (loginData) => {
        try {
            const res = await apiLogin(loginData)
            console.log(res)
            if (setting.successCode.includes(res.code)) {
                console.log(res.data)
                // 更新状态
                token.value = res.data.token
                user.value = res.data.user
                setAccessToken(res.data.token)
                initPermissions(res.data.permissions)
                return { success: true, data: res.data }
            }
            return { success: false, message: res.message }
        } catch (error) {
            return { success: false, message: '网络错误' }
        }
    }

    const getUserInfo = async () => {
        try {
            const res = await apiGetUserInfo()
            if (setting.successCode.includes(res.code)) {
                user.value = res.data.user
                return { success: true, data: res.data }
            } else {
               return { success: false, message: res.message }
            }
        } catch (err) {
            return { success: false, message: '获取用户信息失败' }
        }
    }

    const logout = () => {
        removeAccessToken()
        user.value = null
        token.value = null
        initPermissions('')
        return { success: true }
    }

    const register = async (registerData) => {

    }

    return { user, token, isLogin, login, getUserInfo, logout, register }
})

