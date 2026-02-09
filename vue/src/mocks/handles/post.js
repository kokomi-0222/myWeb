// mocks/handlers/post.js

let posts = [
  {
    id: '1',
    title: '今天去爬山了',
    tag: ['爬山', '旅游'],
    content: '<p>云海太美了！</p>',
    media: [
      {
        id: 'media_1_1', // 媒体唯一ID（必加）
        thumbnail_url: new URL('@/assets/images/kokomi001.jpg', import.meta.url).href, // 缩略图URL（必加）
        preview_url: new URL('@/assets/images/kokomi001.jpg', import.meta.url).href, // 预览图URL（必加）
        row_url: new URL('@/assets/images/kokomi001.jpg', import.meta.url).href,
        type: 'image/jpeg', // 媒体类型（必加）
        width: 1920, // 原图宽度（必加）
        height: 1080, // 原图高度（必加）
        size: 2048000, // 文件大小（字节，推荐加）
        alt: '云海风景图', // 替代文本（推荐加）
        orientation: 1, // 图片方向（1=正常，推荐加）
        format: 'jpeg', // 文件格式（可选加）
        is_animated: false, // 是否动图（可选加）
      },
      ...Array.from({ length: 6 }).map((_, idx) => {
        const seed = getRandomInt(0, 1000)
        const { width, height } = getRandomSize()
        return {
          id: `media_1_${idx + 2}`,
          thumbnail_url: `https://picsum.photos/seed/${seed}/100/100`, // 缩略图（小尺寸）
          preview_url: `https://picsum.photos/seed/${seed}/${width}/${height}`, // 预览图（高清原图尺寸）
          row_url: `https://picsum.photos/seed/${seed}/${width}/${height}`,
          type: 'image/jpeg',
          width,
          height,
          size: getRandomFileSize(),
          alt: `帖子配图${idx + 2}`,
          orientation: 1,
          format: 'jpeg',
          is_animated: false,
        }
      }),
      //错误的url
      {
        id: 'media_1_8',
        thumbnail_url: 'https://picsum.photo123123123_thumb',
        preview_url: 'https://picsum.photo123123123',
        row_url: 'https://picsum.photo123123123',
        type: 'image/jpeg',
        width: 800,
        height: 600,
        size: 102400,
        alt: '失效的图片',
        orientation: 1,
        format: 'jpeg',
        is_animated: false,
      },
    ],
    author: {
      id: 1,
      name: 'kokomi',
      nameColor: '#e966b2',
      primaryRole: 'admin',
      avatar: new URL('@/assets/images/kokomi.jpg', import.meta.url).href,
      badge: '',
      ornament: '',
    },
    createdAt: '2026-01-05T10:00:00Z',
    views: 1200,
    forward: 0,
    likes: 0,
    commentsCount: 0,
    likedByMe: false,
  },
  {
    id: '2',
    title: '今天去爬山了',
    tag: ['爬山', '旅游'],
    content: '<p>住在大山里针不戳</p>',
    media: [
      {
        id: 'media_2_1', // 媒体唯一ID（必加）
        thumbnail_url: new URL('@/assets/images/kokomi002.jpg', import.meta.url).href, // 缩略图URL（必加）
        preview_url: new URL('@/assets/images/kokomi002.jpg', import.meta.url).href, // 预览图URL（必加）
        row_url: new URL('@/assets/images/kokomi002.jpg', import.meta.url).href,
        type: 'image/jpeg',
        width: 1920,
        height: 1080,
        size: 2048000,
        alt: '云海风景图',
        orientation: 1,
        format: 'jpeg',
        is_animated: false,
      },
      ...Array.from({ length: 3 }).map((_, idx) => {
        const seed = getRandomInt(0, 1000)
        const { width, height } = getRandomSize()
        return {
          id: `media_2_${idx + 2}`,
          thumbnail_url: `https://picsum.photos/seed/${seed}/100/100`, // 缩略图（小尺寸）
          preview_url: `https://picsum.photos/seed/${seed}/${width}/${height}`, // 预览图（高清原图尺寸）
          row_url: `https://picsum.photos/seed/${seed}/${width}/${height}`,
          type: 'image/jpeg',
          width,
          height,
          size: getRandomFileSize(),
          alt: `帖子配图${idx + 2}`,
          orientation: 1,
          format: 'jpeg',
          is_animated: false,
        }
      }),
    ],
    author: {
      id: 2,
      name: 'admin',
      nameColor: '#cf0e0e',
      primaryRole: 'admin',
      avatar: new URL('@/assets/images/kokomi.jpg', import.meta.url).href,
      badge: '',
      ornament: '',
    },
    createdAt: '2026-01-05T10:00:00Z',
    views: 1,
    forward: 0,
    likes: 1,
    commentsCount: 2,
    likedByMe: false,
  },
  {
    id: '3',
    title: '今天去爬山了',
    tag: ['爬山', '旅游'],
    content: '<p>住在大山里针不戳</p>',
    media: [
      {
        id: 'media_3_1', // 媒体唯一ID（必加）
        thumbnail_url: new URL('@/assets/images/kokomi003.jpg', import.meta.url).href, // 缩略图URL（必加）
        preview_url: new URL('@/assets/images/kokomi003.jpg', import.meta.url).href, // 预览图URL（必加）
        row_url: new URL('@/assets/images/kokomi003.jpg', import.meta.url).href,
        type: 'image/jpeg',
        width: 1920,
        height: 1080,
        size: 2048000,
        alt: '云海风景图',
        orientation: 1,
        format: 'jpeg',
        is_animated: false,
      },
      ...Array.from({ length: 1 }).map((_, idx) => {
        const seed = getRandomInt(0, 1000)
        const { width, height } = getRandomSize()
        return {
          id: `media_3_${idx + 2}`,
          thumbnail_url: `https://picsum.photos/seed/${seed}/100/100`, // 缩略图（小尺寸）
          preview_url: `https://picsum.photos/seed/${seed}/${width}/${height}`, // 预览图（高清原图尺寸）
          row_url: `https://picsum.photos/seed/${seed}/${width}/${height}`,
          type: 'image/jpeg',
          width,
          height,
          size: getRandomFileSize(),
          alt: `帖子配图${idx + 2}`,
          orientation: 1,
          format: 'jpeg',
          is_animated: false,
        }
      }),
    ],
    author: {
      id: 3,
      name: '张三',
      nameColor: '#636161',
      primaryRole: 'guest',
      avatar: '',
      badge: '',
      ornament: '',
    },
    createdAt: '2026-01-05T10:00:00Z',
    views: 1,
    likes: 1,
    forward: 0,
    commentsCount: 2,
    likedByMe: false,
  },
  {
    id: '4',
    title: '今天去爬山了',
    tag: ['爬山', '旅游'],
    content: '<p>住在大山里针不戳</p>',
    media: [
      {
        id: 'media_4_1', // 媒体唯一ID（必加）
        thumbnail_url: new URL('@/assets/images/kokomi004.jpg', import.meta.url).href, // 缩略图URL（必加）
        preview_url: new URL('@/assets/images/kokomi004.jpg', import.meta.url).href, // 预览图URL（必加）
        row_url: new URL('@/assets/images/kokomi004.jpg', import.meta.url).href,
        type: 'image/jpeg',
        width: 1920,
        height: 1080,
        size: 2048000,
        alt: '云海风景图',
        orientation: 1,
        format: 'jpeg',
        is_animated: false,
      },
      ...Array.from({ length: 2 }).map((_, idx) => {
        const seed = getRandomInt(0, 1000)
        const { width, height } = getRandomSize()
        return {
          id: `media_4_${idx + 2}`,
          thumbnail_url: `https://picsum.photos/seed/${seed}/100/100`, // 缩略图（小尺寸）
          preview_url: `https://picsum.photos/seed/${seed}/${width}/${height}`, // 预览图（高清原图尺寸）
          row_url: `https://picsum.photos/seed/${seed}/${width}/${height}`,
          type: 'image/jpeg',
          width,
          height,
          size: getRandomFileSize(),
          alt: `帖子配图${idx + 2}`,
          orientation: 1,
          format: 'jpeg',
          is_animated: false,
        }
      }),
    ],
    author: {
      id: 4,
      name: '李四',
      nameColor: '#242323',
      primaryRole: 'member',
      avatar: '',
      badge: '',
      ornament: '',
    },
    createdAt: '2026-01-05T10:00:00Z',
    views: 1,
    likes: 1,
    commentsCount: 2,
    likedByMe: false,
  },
  {
    id: '5',
    title: '今天去爬山了',
    tag: ['爬山', '旅游'],
    content: '<p>住在大山里针不戳</p>',
    media: [
      {
        id: 'media_3_1', // 媒体唯一ID（必加）
        thumbnail_url: new URL('@/assets/images/kokomi005.jpg', import.meta.url).href, // 缩略图URL（必加）
        preview_url: new URL('@/assets/images/kokomi005.jpg', import.meta.url).href, // 预览图URL（必加）
        row_url: new URL('@/assets/images/kokomi005.jpg', import.meta.url).href,
        type: 'image/jpeg',
        width: 1920,
        height: 1080,
        size: 2048000,
        alt: '云海风景图',
        orientation: 1,
        format: 'jpeg',
        is_animated: false,
      },
      ...Array.from({ length: 3 }).map((_, idx) => {
        const seed = getRandomInt(0, 1000)
        const { width, height } = getRandomSize()
        return {
          id: `media_5_${idx + 2}`,
          thumbnail_url: `https://picsum.photos/seed/${seed}/100/100`, // 缩略图（小尺寸）
          preview_url: `https://picsum.photos/seed/${seed}/${width}/${height}`, // 预览图（高清原图尺寸）
          row_url: `https://picsum.photos/seed/${seed}/${width}/${height}`,
          type: 'image/jpeg',
          width,
          height,
          size: getRandomFileSize(),
          alt: `帖子配图${idx + 2}`,
          orientation: 1,
          format: 'jpeg',
          is_animated: false,
        }
      }),
    ],
    author: {
      id: 5,
      name: '王五',
      nameColor: '#ff6699',
      primaryRole: 'vip',
      avatar: new URL('@/assets/images/kokomi.jpg', import.meta.url).href,
      badge: '',
      ornament: '',
    },
    createdAt: '2026-01-05T10:00:00Z',
    views: 1,
    likes: 1,
    forward: 0,
    commentsCount: 2,
    likedByMe: false,
  },
  {
    id: '6',
    title: '今天去爬山了',
    tag: ['爬山', '旅游'],
    content: '<p>住在大山里针不戳</p>',
    media: [
      {
        id: 'media_6_1', // 媒体唯一ID（必加）
        thumbnail_url: new URL('@/assets/images/kokomi006.jpg', import.meta.url).href, // 缩略图URL（必加）
        preview_url: new URL('@/assets/images/kokomi006.jpg', import.meta.url).href, // 预览图URL（必加）
        row_url: new URL('@/assets/images/kokomi006.jpg', import.meta.url).href,
        type: 'image/jpeg',
        width: 1920,
        height: 1080,
        size: 2048000,
        alt: '云海风景图',
        orientation: 1,
        format: 'jpeg',
        is_animated: false,
      },
      ...Array.from({ length: 6 }).map((_, idx) => {
        const seed = getRandomInt(0, 1000)
        const { width, height } = getRandomSize()
        return {
          id: `media_6_${idx + 2}`,
          thumbnail_url: `https://picsum.photos/seed/${seed}/100/100`, // 缩略图（小尺寸）
          preview_url: `https://picsum.photos/seed/${seed}/${width}/${height}`, // 预览图（高清原图尺寸）
          row_url: `https://picsum.photos/seed/${seed}/${width}/${height}`,
          type: 'image/jpeg',
          width,
          height,
          size: getRandomFileSize(),
          alt: `帖子配图${idx + 2}`,
          orientation: 1,
          format: 'jpeg',
          is_animated: false,
        }
      }),
    ],
    author: {
      id: 1,
      name: 'kokomi',
      nameColor: '#e966b2',
      primaryRole: 'admin',
      avatar: '',
      badge: '',
      ornament: '',
    },
    createdAt: '2026-01-05T10:00:00Z',
    views: 1,
    likes: 1,
    forward: 0,
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
    code: '200',
    data: { list, total },
  }
}

export function mockCreatePost({ data }) {
  const newPost = { id: Date.now(), ...data }
  posts.push(newPost)
  return { code: '200', data: newPost }
}

export function mockDeletePost({ params }) {
  const { id } = params
  posts = posts.filter((p) => p.id !== Number(id))
  return { code: '200', message: '删除成功' }
}

/**
 * 生成指定范围的随机整数
 * @param {number} min 最小值（包含）
 * @param {number} max 最大值（包含）
 * @returns {number} 随机整数
 */
function getRandomInt(min, max) {
  min = Math.ceil(min) // 确保 min 是整数（向上取整）
  max = Math.floor(max) // 确保 max 是整数（向下取整）
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// 辅助函数：生成随机尺寸（模拟后端返回的原图尺寸）
function getRandomSize() {
  const widths = [800, 1080, 1200, 1920]
  const heights = [600, 900, 1080, 1440]
  const wIdx = getRandomInt(0, widths.length - 1)
  const hIdx = getRandomInt(0, heights.length - 1)
  return { width: widths[wIdx], height: heights[hIdx] }
}

// 辅助函数：生成随机文件大小（字节）
function getRandomFileSize() {
  return getRandomInt(102400, 5120000) // 100KB ~ 5MB
}
