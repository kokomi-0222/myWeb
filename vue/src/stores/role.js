import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getRoleOptions } from '@/api/roles'
import { setRoleLabels } from '@/utils/roleTag'

/**
 * 角色字典（编码 → 中文名）。
 *
 * 以前角色名写死在前端的 ROLE_LABELS 里，后台建了新角色就翻不出中文，
 * 帖子/主页上只能显示 `r8k2m1` 这种编码。现在改成从 /role/list 拉，
 * 拉到之后塞进 roleTag 的全局映射，所有用 roleLabelOf() 的地方自动跟上。
 *
 * 缓存策略：内存里只拉一次；后台改完角色名调 refresh() 强刷。
 */
export const useRoleStore = defineStore('role', () => {
  // [{ code: 'admin', name: '管理员' }]
  const list = ref([])
  const loading = ref(false)
  const loaded = ref(false)

  const load = async (force = false) => {
    if (loading.value) return list.value
    if (loaded.value && !force) return list.value

    loading.value = true
    try {
      const res = await getRoleOptions()
      if (res.code === 200 && Array.isArray(res.data)) {
        list.value = res.data
        const map = {}
        for (const r of res.data) {
          if (r?.code) map[r.code] = r.name || r.code
        }
        setRoleLabels(map)
        loaded.value = true
      }
    } catch (err) {
      // 拉不到就退回前端写死的那 6 个，页面照常显示
      console.warn('加载角色字典失败:', err)
    } finally {
      loading.value = false
    }
    return list.value
  }

  /** 后台改了角色名之后调用，让前台标签重新翻译 */
  const refresh = () => load(true)

  return { list, loading, loaded, load, refresh }
})
