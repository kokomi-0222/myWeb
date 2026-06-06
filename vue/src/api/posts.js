import request from '@/utils/request'

export function getPosts(pageNum, pageSize, sort, keyword, type) {
  return request({
    url: '/post/getPosts',
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
export function getMyPosts(pageNum, pageSize, sort, keyword, type) {
  return request({
    url: '/post/getMyPosts',
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


export function getUserPosts(pageNum, pageSize, sort, keyword, type, userId) {
  return request({
    url: '/post/getUserPosts',
    method: 'get',
    params: {
      pageNum,
      pageSize,
      sort,
      keyword,
      type,
      userId
    }
  })
}

// 发布帖子
export function createPosts(data) {
  return request({
    url: '/post/createPost',
    method: 'post',
    data
  })
}

export function deletePosts(id) {
  return request({
    url: `/post/${id}`,
    method: 'delete'
  })
}

// 点赞
export function likePost(id) {
  return request({
    url: `/post/${id}/like`,
    method: 'post'
  })
}

// 取消点赞
export function unlikePost(id) {
  return request({
    url: `/post/${id}/like`,
    method: 'delete'
  })
}
