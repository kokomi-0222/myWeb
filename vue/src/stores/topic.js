import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getTopics, createTopic } from '@/api/topics'

/**
 * 话题字典。
 *
 * 改造前话题是写死在前端 7 个地方的；现在统一从后端 /topic/list 拉，
 * 首页左栏、手机端抽屉热搜、发布框分类、帖子卡片的类型标签全部读这一份，
 * 站长新建话题后各处自动同步，不用再改代码。
 *
 * 缓存策略：内存里只拉一次。发布完帖子 / 新建完话题手动 invalidate，
 * 避免每次切页面都请求一遍。
 */
export const useTopicStore = defineStore('topic', () => {
  // 后端原始结构：{ id, name, value, color, sort, count }
  const list = ref([])
  const loading = ref(false)
  const loaded = ref(false)

  const loadTopics = async (force = false) => {
    if (loading.value) return list.value
    if (loaded.value && !force) return list.value

    loading.value = true
    try {
      const res = await getTopics()
      if (res.code === 200 && Array.isArray(res.data)) {
        list.value = res.data
        loaded.value = true
      }
    } catch (err) {
      // 拉不到话题不影响发帖：发布框会退化成「不选分类」，帖子照样能发
      console.warn('加载话题列表失败:', err)
    } finally {
      loading.value = false
    }
    return list.value
  }

  /** 只保留有帖子的话题，给「热门话题」这类计数场景用 */
  const usedTopics = computed(() => list.value.filter((t) => Number(t.count) > 0))

  /** 存储值 → 显示名。找不到就原样返回，兼容历史脏数据 */
  const labelOf = (value) => {
    if (!value) return ''
    const hit = list.value.find((t) => t.value === value)
    return hit ? hit.name : value
  }

  /** 存储值 → 圆点颜色 */
  const colorOf = (value) => {
    const hit = list.value.find((t) => t.value === value)
    return hit ? hit.color : '#8a8a8a'
  }

  /** 显示名 → 存储值，替代原来写死的 CATEGORY_VALUE_MAP（中文名搜索分类时用） */
  const valueOfName = (name) => {
    if (!name) return ''
    const key = String(name).trim()
    const hit = list.value.find((t) => t.name === key)
    if (hit) return hit.value
    // 用户直接敲了英文标识（tech 之类）也放行
    const byValue = list.value.find((t) => t.value === key)
    return byValue ? byValue.value : key.toLowerCase()
  }

  /**
   * 新建话题。成功后就地插入列表，不用重新拉整个列表。
   * 失败时抛出带后端提示语的错误，交给调用方 toast。
   */
  const addTopic = async (name) => {
    const res = await createTopic({ name: String(name || '').trim() })
    if (res.code !== 200) {
      throw new Error(res.msg || '新建话题失败')
    }
    const created = res.data
    if (created && !list.value.some((t) => t.value === created.value)) {
      list.value = [...list.value, created]
    }
    return created
  }

  /** 发布帖子后调用：数量变了，下次进首页重新拉 */
  const invalidate = () => {
    loaded.value = false
  }

  return {
    list,
    usedTopics,
    loading,
    loaded,
    loadTopics,
    labelOf,
    colorOf,
    valueOfName,
    addTopic,
    invalidate,
  }
})
