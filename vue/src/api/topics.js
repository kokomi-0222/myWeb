import request from '@/utils/request'

// 话题列表（公开，不需要登录）
export function getTopics() {
  return request({
    url: '/topic/list',
    method: 'get',
  })
}

// 新建话题（后端校验 topic:create 权限，只有站长能调）
export function createTopic(data) {
  return request({
    url: '/topic',
    method: 'post',
    data,
  })
}
