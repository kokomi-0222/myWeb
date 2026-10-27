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
import { initPermissions, usePermission } from '@/utils/usePermission.js'
import { roleLabelOf, ROLE_DEFAULT_COLORS } from '@/utils/roleTag'

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
  const login = async (loginData, captchaKey, captchaCode) => {
    isLoading.value = true
    try {
      const res = await apiLogin(loginData, captchaKey, captchaCode)
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
      return { success: false, message: err?.message || '登录失败' }
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

  /**
   * 悄悄刷新一次用户信息（不碰 isLoading）。
   * <p>
   * isLoading 会参与 isLogin 计算，一置 true 页面上的发布框就会瞬间
   * 掉成「登录后可评论」再变回来，闪得很明显。这里只更新 user/roles/权限。
   */
  const refreshUser = async () => {
    if (!token.value) return
    try {
      const res = await apiGetUserInfo()
      if (res?.data && setting.successCode.includes(res.code)) {
        user.value = res.data.user
        roles.value = res.data.roles || []
        initPermissions(res.data.permissions || [])
      }
    } catch (err) {
      // 刷新失败不处理：后端下次还会拦，界面保持原样就行
      console.error(err)
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
  // 后端注册成功会直接返回 token（邮箱在注册时就验证过了，没必要再让用户输一遍密码），
  // 所以这里拿到的就是一份完整的登录态，和 login 的收尾完全一样。
  const register = async (registerData) => {
    try {
      const res = await apiRegister(registerData)
      if (setting.successCode.includes(res.code)) {
        const data = res.data || {}
        if (data.token) {
          token.value = data.token
          user.value = data.user
          roles.value = data.roles || []
          setAccessToken(data.token)
          initPermissions(data.permissions || [])
        }
        return { success: true, data }
      }
      return { success: false, message: res.msg || '注册失败' }
    } catch (err) {
      // 错误文案拦截器已经弹过一次了，这里只把消息透给调用方决定落在哪个字段上
      return { success: false, message: err?.message || '注册失败' }
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

  // 颜色统一取自 roleTag.js 的 ROLE_DEFAULT_COLORS，别在这里另写一套
  // （以前这里 member 是 #636161、guest 是 #a0a4ab，和实际渲染的颜色对不上，
  //  真正决定方块颜色的是 roleBlockColor 的兜底逻辑）
  const roleOptions = [
    { role: 'admin', name: '管理员', color: ROLE_DEFAULT_COLORS.admin },
    { role: 'moderator', name: '版主', color: ROLE_DEFAULT_COLORS.moderator },
    { role: 'editor', name: '编辑', color: ROLE_DEFAULT_COLORS.editor },
    { role: 'vip', name: '会员', color: ROLE_DEFAULT_COLORS.vip },
    { role: 'member', name: '普通用户', color: ROLE_DEFAULT_COLORS.member },
    { role: 'guest', name: '游客', color: ROLE_DEFAULT_COLORS.guest },
  ]
  const primaryRole = computed(() => {
    const code = user.value?.primaryRole
    if (!code) return undefined
    const hit = roleOptions.find((item) => item.role === code)
    if (hit) return hit
    // 后台自建的角色不在这张表里：名字从角色字典翻（/role/list），
    // 颜色沿用默认标签粉，否则「我的空间」会渲染出一个空方块。
    return { role: code, name: roleLabelOf(code), color: '#fb7299' }
  })

  // ---- 处罚状态（0 正常 / 1 禁言 / 2 封号）----
  // 封号根本登不进来，所以前端真正要处理的是 1：能浏览，但不能发内容。
  // 这只是体验层：真正的拦截在后端发帖/评论接口里，改前端绕不过去。
  const banStatus = computed(() => user.value?.status || 0)
  const isMuted = computed(() => banStatus.value === 1)

  /** 解除时间文案：永久 / 11-01 12:00 */
  const banUntilText = computed(() => {
    const raw = user.value?.banUntil
    if (!raw) return '永久'
    const d = new Date(raw)
    if (Number.isNaN(d.getTime())) return '稍后'
    const pad = (n) => String(n).padStart(2, '0')
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  })

  /** 给提示条用的一句话（评论框那种没有独立标题的地方用） */
  const muteText = computed(() => {
    if (!isMuted.value) return ''
    const reason = user.value?.banReason ? `，原因：${user.value.banReason}` : ''
    return `你已被禁言（${banUntilText.value} 解除），暂时无法发布内容和评论${reason}`
  })

  /**
   * 提示卡的副标题：只放「什么时候恢复 + 原因」。
   * 不放「期间无法发布内容、评论和回复」那句 —— 手机上卡片只有一屏宽，
   * 这句话会把文案挤成三行；后果交给标题 + 卡片的补充行表达。
   */
  const muteDetail = computed(() => {
    if (!isMuted.value) return ''
    const when = user.value?.banUntil ? `${banUntilText.value} 恢复` : '永久禁言'
    const reason = user.value?.banReason ? ` · 原因：${user.value.banReason}` : ''
    return `${when}${reason}`
  })

  // ---- 等级（游客 / 普通用户 / 会员）----
  // 谁能干什么全看权限码，代码里不写死角色名 —— 这样站长在后台调整
  // 「角色 → 权限」矩阵时，前端会跟着变，不用重新发版。
  //   post:create    发帖（会员 / 普通用户都有，只有游客没有）
  //   comment:create 评论 / 回复 / 举报（同上，游客没有）
  // 真正的拦截在后端 Service 层（507 游客 / 509 没开通发帖权），这里只决定界面显示什么。
  const { hasPermission } = usePermission()
  const canPost = computed(() => isLogin.value && hasPermission('post:create'))
  const canComment = computed(() => isLogin.value && hasPermission('comment:create'))

  // 游客 = 还没绑邮箱（没有 comment:create）。绑完自动升普通用户。
  const needsBindEmail = computed(() => isLogin.value && !canComment.value)

  // 邮箱是否已验证：只在后端明确给了 false 时才算没绑（老接口没这个字段，默认放行）
  const emailVerified = computed(() => user.value?.emailVerified !== false)

  // 后端回了「你已被禁言」（说明发帖 / 评论被拦了）时，立刻把用户信息拉新一次。
  // 发布框和评论框会马上换成提示条，不用重新登录、也不用等用户自己刷新。
  // 禁言不再作废 token，所以这是前端感知处罚的唯一时机。
  // setup store 只在第一次 useUserStore() 时执行，监听不会重复挂。
  if (typeof window !== 'undefined') {
    window.addEventListener('kokomi:muted', refreshUser)
    // 被 507 拦下（或刚验证完）时同步一次状态，提示卡才会消失 / 出现
    window.addEventListener('kokomi:unverified', refreshUser)
  }

  return {
    user,
    roles,
    token,
    isLoading,
    isLogin,
    primaryRole,
    banStatus,
    isMuted,
    banUntilText,
    muteText,
    muteDetail,
    emailVerified,
    canPost,
    canComment,
    needsBindEmail,
    login,
    getUserInfo,
    refreshUser,
    logout,
    register,
    updateProfile,
    updatePassword,
  }
})
