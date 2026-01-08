import request from '@/utils/request'

export function getPosts() {
  return request({
    url: '/posts/selectAll',
    method: 'get'
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