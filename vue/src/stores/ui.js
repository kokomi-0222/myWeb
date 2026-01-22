// stores/ui.js
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useUIStore = defineStore('ui', () => {
    
  const loginModalOpen = ref(false)
  const isDarkMode = ref(false)

  // ========== 屏幕尺寸状态（惰性初始化） ==========
  const _windowWidth = ref(0)
  const _screenSize = ref('lg') // 'sm' | 'md' | 'lg'
  let _isInitialized = false

  function _initializeScreenSize() {
    if (_isInitialized || typeof window === 'undefined') return

    const update = () => {
      const w = window.innerWidth
      _windowWidth.value = w
      if (w < 768) {
        _screenSize.value = 'sm'
      } else if (w < 1024) {
        _screenSize.value = 'md'
      } else {
        _screenSize.value = 'lg'
      }
    }

    update()
    window.addEventListener('resize', update, { passive: true })
    _isInitialized = true
  }

  // 暴露安全的、自动初始化的 computed 属性
  const windowWidth = computed(() => {
    _initializeScreenSize()
    return _windowWidth.value
  })

  const screenSize = computed(() => {
    _initializeScreenSize()
    return _screenSize.value
  })

  // ========== 便捷计算属性（可选但推荐） ==========
  const isMobile = computed(() => screenSize.value === 'sm')
  const isTablet = computed(() => screenSize.value === 'md')
  const isDesktop = computed(() => screenSize.value === 'lg')

  // ========== 方法 ==========
  function openLoginModal() {
    loginModalOpen.value = true
  }

  function closeLoginModal() {
    loginModalOpen.value = false
  }

  function toggleTheme() {
    isDarkMode.value = !isDarkMode.value
  }

  // 如果你确实需要手动清理（比如在测试中），可以暴露（通常不需要）
  function _cleanup() {
    if (!_isInitialized || typeof window === 'undefined') return
    // 注意：我们无法直接移除 listener，因为 update 是闭包
    // 实际应用中一般不需要清理，除非页面完全卸载
  }

  return {
    // 状态（只读 computed）
    windowWidth,
    screenSize,
    isMobile,
    isTablet,
    isDesktop,

    loginModalOpen,
    isDarkMode,

    // 方法
    openLoginModal,
    closeLoginModal,
    toggleTheme,
  }
})
