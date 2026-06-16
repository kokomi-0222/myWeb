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

// 根据ID获取单个帖子
export function getPostById(id) {
  return request({
    url: `/post/${id}`,
    method: 'get'
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

// 获取评论列表
export function getComments(postId) {
  return request({
    url: '/comments',
    method: 'get',
    params: { postId }
  })
}

// 分页获取评论列表
export function getCommentsPaginated(postId, pageNum, pageSize) {
  return request({
    url: '/comments/page',
    method: 'get',
    params: { postId, pageNum, pageSize }
  })
}

// 发表评论
export function createComment(postId, data) {
  return request({
    url: '/comments',
    method: 'post',
    params: { postId },
    data
  })
}

// 删除评论
export function deleteComment(commentId) {
  return request({
    url: `/comments/${commentId}`,
    method: 'delete'
  })
}

// 点赞评论
export function likeComment(commentId) {
  return request({
    url: `/comments/${commentId}/like`,
    method: 'post'
  })
}

// 取消点赞评论
export function unlikeComment(commentId) {
  return request({
    url: `/comments/${commentId}/like`,
    method: 'delete'
  })
}
