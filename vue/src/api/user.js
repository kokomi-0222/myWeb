// api/user.js
import request from '@/utils/request'
import setting from '@/config/setting'
import { encryptedData } from '@/utils/encrypt'

export async function login(data, captchaKey, captchaCode) {
  // 登录RSA加密
  if (setting.loginRSA) {
    data = await encryptedData(data)
    return request({
      url: '/user/login',
      method: 'post',
      data: {
        encryptedData: data,
        captchaKey: captchaKey || '',
        captchaCode: captchaCode || '',
      },
    })
  }
  // 未开启 RSA 时也要发请求（原来缺少 return，函数返回 undefined，表现为「点击无反应/超时」）
  return request({
    url: '/user/login',
    method: 'post',
    data: {
      encryptedData: JSON.stringify(data),
      captchaKey: captchaKey || '',
      captchaCode: captchaCode || '',
    },
  })
}

/**
 * 注册第二步：用户名 + 密码，凭 ticket 建号。
 *
 * ⚠️ 只把**密码**塞进 RSA：用户名默认就是邮箱地址（最长 50 字符），
 * 整包塞进去必然超过 RSA-1024 单块 117 字节的上限 —— JSEncrypt 会直接
 * encrypt 失败，用户只看到「密码加密失败，请刷新页面后重试」。
 * 而且它是按字节加密的，中文用户名 charCode>255 会被截成乱码。
 * 用户名走明文（HTTPS 已经兜住），只加密密码两项（~90 字节，安全）。
 *
 * @param {{ticket:string, password:string, confirmPassword:string}} data
 */
export async function register(data) {
  const secret = {
    password: data.password,
    confirmPassword: data.confirmPassword,
  }
  const encrypted = setting.loginRSA
    ? await encryptedData(secret)
    : JSON.stringify(secret)
  return request({
    url: '/user/register',
    method: 'post',
    data: {
      ticket: data.ticket,
      encryptedData: encrypted,
    },
  })
}

/**
 * 注册第一步：校验邮箱验证码 → 换一张 ticket（10 分钟有效）。
 * 这一步过后才算「邮箱是本人的」，第二步建号凭 ticket，不再带验证码。
 * @returns {Promise<{data:{ticket:string}}>}
 */
export function verifyRegisterEmail(email, code) {
  return request({
    url: '/user/register/verify-email',
    method: 'post',
    data: { email, code },
  })
}

/** 给当前登录用户的邮箱发验证码（60 秒一次、每小时 5 封） */
/**
 * 发邮箱验证码。
 * @param {string} [email] 要绑定的邮箱；不传就用账号上已有的（老账号）
 * @param {string} captchaKey GET /captcha 拿到的 key
 * @param {string} captchaCode 用户看图输入的字符
 */
export function sendVerifyCode(email, captchaKey, captchaCode) {
  return request({
    url: '/user/verify/send',
    method: 'post',
    data: { ...(email ? { email } : {}), captchaKey, captchaCode },
    // 图形验证码错的提示由 CaptchaPrompt 就地显示，别再弹一条 toast（见 utils/request.js）
    silent: true,
  })
}

/**
 * 提交邮箱验证码：通过后邮箱绑定到账号，游客会顺带升成普通用户（能评论）
 * @param {string} code 6 位验证码
 * @param {string} [email] 要绑定的邮箱；不传就用账号上已有的
 */
export function confirmVerifyCode(code, email) {
  return request({
    url: '/user/verify/confirm',
    method: 'post',
    data: email ? { email, code } : { code },
  })
}

export function logout() {
  return request({
    url: '/user/logout',
    method: 'post',
  })
}

/**
 * 换绑邮箱第一步：验当前密码 → 给新邮箱发验证码。
 * 密码和「修改密码」一样走 RSA（解出来是 {oldPassword}）；
 * 后端会先 BCrypt 校验密码，不对就直接拒。
 * @param {string} email 要换绑到的新邮箱
 * @param {string} encryptedData RSA 加密后的 {oldPassword}
 */
export function sendChangeEmailCode(email, encryptedData, captchaKey, captchaCode) {
  return request({
    url: '/user/email/change/send',
    method: 'post',
    data: { email, encryptedData, captchaKey, captchaCode },
    silent: true,
  })
}

/** 换绑邮箱第二步：新邮箱 + 验证码。角色不动，只换联系方式 */
export function confirmChangeEmail(email, code) {
  return request({
    url: '/user/email/change/confirm',
    method: 'post',
    data: { email, code },
  })
}

/**
 * 解绑邮箱：清空邮箱 + 验证位归零，**角色不动**（发帖评论照旧）。
 * 必须带当前密码（RSA 加密的 {oldPassword}）—— 它能改写「忘记密码」的凭据，
 * 不验密码的话，拿到登录态的人就能解绑再绑自己的邮箱接管账号。
 * @param {string} encryptedData RSA 加密后的 {oldPassword}
 */
export function unbindEmail(encryptedData) {
  return request({
    url: '/user/email/unbind',
    method: 'post',
    data: { encryptedData },
  })
}

/**
 * 注册前给邮箱发验证码（**免登录**）。
 * 和「找回密码」不同，邮箱被占用时这里会直接报错 —— 注册场景瞒着用户没意义。
 * 免登录的发信接口，必然要过人机校验（captchaKey + captchaCode）。
 */
export function sendRegisterCode(email, captchaKey, captchaCode) {
  return request({
    url: '/user/register/email-code',
    method: 'post',
    data: { email, captchaKey, captchaCode },
    silent: true,
  })
}

/** 找回密码第一步：给已绑定的邮箱发验证码（免登录，同样要人机校验） */
export function sendResetCode(email, captchaKey, captchaCode) {
  return request({
    url: '/user/password/forgot/send',
    method: 'post',
    data: { email, captchaKey, captchaCode },
    silent: true,
  })
}

/** 找回密码界面第 1 步的「下一步」：只校验验证码，不动密码（免登录，码不会被消费） */
export function verifyResetCode(email, code) {
  return request({
    url: '/user/password/forgot/verify',
    method: 'post',
    data: { email, code },
  })
}

/**
 * 找回密码第 2 步：验证码 + 新密码（免登录）。
 * 密码和 /user/password 一样走 RSA，后端解出来还是 {newPassword, confirmPassword}。
 * @param {string} email
 * @param {string} code
 * @param {{newPassword:string, confirmPassword:string}} data
 */
export async function resetPassword(email, code, data) {
  const encrypted = setting.loginRSA
    ? await encryptedData(data)
    : JSON.stringify(data)
  return request({
    url: '/user/password/forgot/reset',
    method: 'post',
    data: { email, code, encryptedData: encrypted },
  })
}

export function getUserInfo() {
  return request({
    url: '/user/info',
    method: 'get',
  })
}

export function updateProfile(data) {
  return request({
    url: '/user/update',
    method: 'post',
    data,
  })
}

export function getUserPermissions() {
  return request({
    url: '/user/permissions',
    method: 'get',
  })
}

// 他人主页的公开资料（无需登录）
export function getUserProfile(id) {
  return request({
    url: `/user/profile/${id}`,
    method: 'get',
  })
}

// 全站统计：帖子数 / 用户数 / 评论数
export function getSiteStats() {
  return request({
    url: '/post/stats',
    method: 'get',
  })
}

export async function updatePassword(data) {
  if (setting.loginRSA) {
    data = await encryptedData(data)
    return request({
      url: '/user/password',
      method: 'post',
      data: {
        encryptedData: data,
      },
    })
  }
  return request({
    url: '/user/password',
    method: 'post',
    data: {
      encryptedData: JSON.stringify(data),
    },
  })
}

/**
 * 自助注销账号（不可逆）。
 *
 * 参数是已经 RSA 加密好的密文（`{"oldPassword": "..."}`），加密在组件里用
 * 动态 import 做 —— jsencrypt 一百多 KB，没必要为「点了一次注销」塞进个人中心主包。
 * 后端要密码是因为注销不可逆，光有 token 证明不了是本人。
 */
export function deactivateAccount(encryptedData) {
  return request({
    url: '/user/deactivate',
    method: 'post',
    data: { encryptedData },
  })
}
