// mocks/handlers/post.js
let posts = [
  {
    id: "1",
    title: "今天去爬山了",
    tag: [
      "爬山", "旅游"
    ],
    content: "<p>云海太美了！</p>",
    mediaUrls: [
      new URL("@/assets/images/kokomi001.jpg", import.meta.url).href,
      new URL("@/assets/images/kokomi002.jpg", import.meta.url).href,
      new URL("@/assets/images/kokomi003.jpg", import.meta.url).href,
    ],
    author: {
      id: 1, name: "kokomi", nameColor: "#e966b2",
      primaryRole: "admin", avatar: "", badge: "", ornament: ""
    },
    createdAt: "2026-01-05T10:00:00Z",
    views: 1200,
    likes: 89,
    commentsCount: 24,
    likedByMe: false,
  },
  {
    id: "2",
    title: "今天去爬山了",
    tag: [
      "爬山", "旅游"
    ],
    content: "<p>住在大山里针不戳</p>",
    mediaUrls: [
      new URL("@/assets/images/kokomi002.jpg", import.meta.url).href,
    ],
    author: {
      id: 2, name: "admin", nameColor: "#cf0e0e",
      primaryRole: "admin", avatar: new URL("@/assets/images/kokomi.jpg", import.meta.url).href, badge: "", ornament: ""
    },
    createdAt: "2026-01-05T10:00:00Z",
    views: 1,
    likes: 1,
    commentsCount: 2,
    likedByMe: false,
  },
  {
    id: "3",
    title: "今天去爬山了",
    tag: [
      "爬山", "旅游"
    ],
    content: "<p>住在大山里针不戳</p>",
    mediaUrls: [
      new URL("@/assets/images/kokomi003.jpg", import.meta.url).href,
    ],
    author: {
      id: 3, name: "张三", nameColor: "#636161",
      primaryRole: "guest", avatar: "", badge: "",
      ornament: "",
    },
    createdAt: "2026-01-05T10:00:00Z",
    views: 1,
    likes: 1,
    commentsCount: 2,
    likedByMe: false,
  },
  {
    id: "4",
    title: "今天去爬山了",
    tag: [
      "爬山", "旅游"
    ],
    content: "<p>住在大山里针不戳</p>",
    mediaUrls: [
      new URL("@/assets/images/kokomi004.jpg", import.meta.url).href,
    ],
    author: {
      id: 4, name: "李四", nameColor: "#242323",
      primaryRole: "member", avatar: "", badge: "",
      ornament: ""
    },
    createdAt: "2026-01-05T10:00:00Z",
    views: 1,
    likes: 1,
    commentsCount: 2,
    likedByMe: false,
  },
  {
    id: "5",
    title: "今天去爬山了",
    tag: [
      "爬山", "旅游"
    ],
    content: "<p>住在大山里针不戳</p>",
    mediaUrls: [
      new URL("@/assets/images/kokomi005.jpg", import.meta.url).href,
    ],
    author: {
      id: 5, name: "王五", nameColor: "#ff6699", primaryRole: "vip", avatar: new URL("@/assets/images/kokomi.jpg", import.meta.url).href, badge: "",
      ornament: "",
    },
    createdAt: "2026-01-05T10:00:00Z",
    views: 1,
    likes: 1,
    commentsCount: 2,
    likedByMe: false,
  },
  {
    id: "6",
    title: "今天去爬山了",
    tag: [
      "爬山", "旅游"
    ],
    content: "<p>住在大山里针不戳</p>",
    mediaUrls: [
      new URL("@/assets/images/kokomi006.jpg", import.meta.url).href,
    ],
    author: {
      id: 1, name: "kokomi", nameColor: "#e966b2",
      primaryRole: "admin", avatar: "", badge: "", ornament: ""
    },
    createdAt: "2026-01-05T10:00:00Z",
    views: 1,
    likes: 1,
    commentsCount: 2,
    likedByMe: false,
  },
]

export function mockGetPosts({ params }) {
  console.log('[MOCK] 获取帖子列表')
  const { pageNum = 1, pageSize = 10, sort, keyword, type } = params
  console.log(`[MOCK] 分页参数: pageNum=${pageNum}, pageSize=${pageSize}`)
  console.log(`[MOCK] 排序参数: sort=${sort}`)
  console.log(`[MOCK] 关键字参数: keyword=${keyword}`)
  console.log(`[MOCK] 类型参数: type=${type}`)
  const total = posts.length
  const list = posts.slice((pageNum - 1) * pageSize, pageNum * pageSize)
  return {
    code: "200",
    data: { list, total }
  }
}

export function mockCreatePost({ data }) {
  const newPost = { id: Date.now(), ...data }
  posts.push(newPost)
  return { code: "200", data: newPost }
}

export function mockDeletePost({ params }) {
  const { id } = params
  posts = posts.filter(p => p.id !== Number(id))
  return { code: "200", message: '删除成功' }
}
