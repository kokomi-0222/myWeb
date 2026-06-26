// mocks/index.js
import * as user from '@/mocks/handles/user.js'
import * as post from '@/mocks/handles/post.js'
import * as comment from '@/mocks/handles/comment.js'
import { getAccessToken} from '@/utils/accessToken'

// 🗺️ 路由映射表：URL + Method → 对应的 mock 函数
const MOCK_ROUTES = [
    // 验证码
    { url: '/captcha', method: 'get', handler: user.mockGetCaptcha },

    // 用户
    { url: '/user/login', method: 'post', handler: user.mockLogin },
    { url: '/user/register', method: 'post', handler: user.mockRegister },
    { url: '/user/info', method: 'post', handler: user.mockGetUserInfo },
    { url: '/user/logout', method: 'post', handler: user.mockLogout },
    { url: '/user/permissions', method: 'get', handler: user.mockGetUserPermissions },

    // 帖子
    { url: '/post/getPosts', method: 'get', handler: post.mockGetPosts },
    { url: '/post/createPost', method: 'post', handler: post.mockCreatePost },
    { url: '/post/deleteById/', method: 'delete', handler: post.mockDeletePost, extractIdFromUrl: true },
    { url: '/post/getUserPosts', method: 'get', handler: post.mockGetUserPosts },
    { urlPattern: /^\/post\/(\d+)\/like$/, method: 'post', handler: post.mockLikePost },
    { urlPattern: /^\/post\/(\d+)\/like$/, method: 'delete', handler: post.mockUnlikePost },

    // 评论
    { url: '/comments', method: 'get', handler: comment.mockGetComments },
    { url: '/comments/page', method: 'get', handler: comment.mockGetCommentsPaginated },
    { url: '/comments', method: 'post', handler: comment.mockCreateComment },
    { urlPattern: /^\/comments\/(\d+)$/, method: 'delete', handler: comment.mockDeleteComment },
    { urlPattern: /^\/comments\/(\d+)\/like$/, method: 'post', handler: comment.mockLikeComment },
    { urlPattern: /^\/comments\/(\d+)\/like$/, method: 'delete', handler: comment.mockUnlikeComment },
]

/**
 * 根据 config 匹配 mock handler 并执行
 * @param {Object} config - axios config
 * @returns {Promise}
 */
export function handleMockRequest(config) {
    const { url = '', method = 'get', params = {}, data = {} } = config
    const normalizedMethod = method.toLowerCase()
    let extraParams = {}
    // 精确匹配（支持 /api/posts/123 这种带参数的 URL）
    const matchedRoute = MOCK_ROUTES.find(route => {
        if (route.method !== normalizedMethod) return false

        // 正则匹配：如 /post/123/like
        if (route.urlPattern) {
            const match = url.match(route.urlPattern)
            if (match) {
                extraParams = { id: Number(match[1]) }
                return route
            }
            return false
        }

        // 处理带参数的路径，如 /api/posts/123
        if (route.extractIdFromUrl && url.startsWith(route.url)) {
            const idStr = url.slice(route.url.length)
            const id = Number(idStr)
            if (!isNaN(id)) {
                extraParams = { id }
                return route;
            }
            return null;
        }
        // 普通路径匹配
        if (route.url === url) {
            return route;
        }
    })

    if (matchedRoute) {
        const token = getAccessToken()
        const mockData = matchedRoute.handler({
            headers: {
                authorization: token ? `Bearer ${token}` : ''
            },
            params: { ...params, ...extraParams },
            data
        })
        // 模拟网络延迟
        //console.log(`response:` , mockData)
        return new Promise(resolve => {
            setTimeout(() => resolve(mockData), 200)
        })
    }

    // 未匹配到 mock，返回通用成功
    console.warn(`[MOCK] 未找到匹配的 mock 接口: ${method.toUpperCase()} ${url}`)
    return Promise.resolve({
        code: 200,
        data: {},
        message: `Mock fallback for ${method} ${url}`
    })
}
