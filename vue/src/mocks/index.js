// mocks/index.js
import * as user from '@/mocks/handles/user.js'
import * as post from '@/mocks/handles/post.js'
import * as comment from '@/mocks/handles/comment.js'
import { getAccessToken} from '@/utils/accessToken'

// 🗺️ 路由映射表：URL + Method → 对应的 mock 函数
const MOCK_ROUTES = [
    // 用户
    { url: '/user/login', method: 'post', handler: user.mockLogin },
    { url: '/user/register', method: 'post', handler: user.mockRegister },
    { url: '/user/info', method: 'post', handler: user.mockGetUserInfo },
    { url: '/user/logout', method: 'post', handler: user.mockLogout },
    { url: '/user/permissions', method: 'get', handler: user.mockGetUserPermissions },

    // 帖子
    { url: '/posts/getPosts', method: 'get', handler: post.mockGetPosts },
    { url: '/posts/createPost', method: 'post', handler: post.mockCreatePost },
    { url: '/posts/deleteById/', method: 'delete', handler: post.mockDeletePost, extractIdFromUrl: true },
    { url: '/posts/getUserPosts', method: 'get', handler: post.mockGetUserPosts },

    // 评论
    { url: '/comments/getComments', method: 'get', handler: comment.mockGetComments },
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
