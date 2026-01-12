import request from '@/utils/request'

export function getPosts(pageNum, pageSize) {
  return request({
    url: '/posts/selectPage',
    method: 'get',
    params: {
      pageNum,
      pageSize
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