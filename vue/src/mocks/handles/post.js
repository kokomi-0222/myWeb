// mocks/handlers/post.js
let posts = [
  { id: 1, title: 'Mock 帖子 1', content: 'Hello world' },
  { id: 2, title: 'Mock 帖子 2', content: 'Vue is great!' }
]

export function mockGetPosts({ params }) {
  const { page = 1, size = 10 } = params
  const total = posts.length
  const list = posts.slice((page - 1) * size, page * size)
  return {
    code: 200,
    data: { list, total }
  }
}

export function mockCreatePost({ data }) {
  const newPost = { id: Date.now(), ...data }
  posts.push(newPost)
  return { code: 200, data: newPost }
}

export function mockDeletePost({ params }) {
  const { id } = params
  posts = posts.filter(p => p.id !== Number(id))
  return { code: 200, message: '删除成功' }
}
