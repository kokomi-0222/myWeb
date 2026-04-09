import request from '@/utils/request'

export function getPosts(pageNum, pageSize, sort, keyword, type) {
  return request({
    url: '/posts/getPosts',
    method: 'get',
    params: {
      pageNum,
      pageSize,
      sort,
      keyword,
      type
    }
  })
}

/* 获取用户自身帖子 */
export function getUserPosts(pageNum, pageSize, sort, keyword, type) {
  return request({
    url: '/posts/getUserPosts',
    method: 'get',
    params: {
      pageNum,
      pageSize,
      sort,
      keyword,
      type
    }
  })
}

export function createPosts() {
  return request({
    url: '/posts/createPost',
    method: 'post'
  })
}

export function deletePosts(id) {
  return request({
    url: `/posts/deleteById/${id}`,
    method: 'delete'
  })
}