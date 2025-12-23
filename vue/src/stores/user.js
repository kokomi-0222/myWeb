import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getUserInfo as apiGetUserInfo, Login as apiLogin } from '@/api/user'
import setting from '@/config/setting'
import { getAccessToken, setAccessToken, removeAccessToken } from '@/utils/accessToken'
/**
 * userInfo 用户信息
 *    id 用户id
 *    username 用户名 
 *    age 年龄
 *    email 邮箱
 *    avatar 头像
 *    phone 手机
 *    sex 性别
 *    role 角色
 */

//选项式API
export const useUserStore = defineStore('user', () => {
    const userInfo = ref(null)
    const token = ref(getAccessToken())
    const isLogin = computed(() => !!userInfo.value)

    const login = async (loginData) => {
        const res = await apiLogin(loginData)
        if (setting.successCode.includes(res.code)) {
            // 保存到stores
            token.value = res.data.token
            userInfo.value = res.data.userInfo
            //持久化存储
            setAccessToken(res.data.token)
            ElMessage.success('登录成功！')
        } else {
            ElMessage.error(res.message)
        }
    }

    const getUserInfo = () => {
        apiGetUserInfo().then(res => {
            if (setting.successCode.includes(res.code)) {
                userInfo.value = res.data
            } else {
                ElMessage.error(res.message)
            }
        })
    }

    const logout = () => {
        removeAccessToken()
        userInfo.value = null
        token.value = null
        ElMessage.success('退出登录成功！')
    }

    const register = async (registerData) => {
        
    }

    return { userInfo, token, isLogin, login, getUserInfo, logout, register}
})




