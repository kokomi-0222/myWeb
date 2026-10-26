// stores/ui.js
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useUIStore = defineStore('ui', () => {
    
  const loginModalOpen = ref(false)
  // 「验证邮箱」弹窗：未验证时点发布框提示 / 被 507 拦下都会把它叫出来
  const verifyModalOpen = ref(false)

  // ========== 暗色主题 ==========
  // 存在 localStorage 里，否则手机端每次刷新都掉回浅色（以前就是这个毛病）。
  // 首次访问跟随系统偏好，用户手动切过之后一切以 localStorage 为准。
  const THEME_KEY = 'kokomi-theme'

  function readInitialDark() {
    if (typeof window === 'undefined') return false
    try {
      const saved = window.localStorage.getItem(THEME_KEY)
      if (saved === 'dark') return true
      if (saved === 'light') return false
    } catch (e) {
      // 隐私模式 / 禁用存储时 localStorage 会抛异常，降级为浅色即可
    }
    return !!window.matchMedia?.('(prefers-color-scheme: dark)')?.matches
  }

  const isDarkMode = ref(readInitialDark())

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

  function openVerifyModal() {
    verifyModalOpen.value = true
  }

  function closeVerifyModal() {
    verifyModalOpen.value = false
  }

  function setDarkMode(value) {
    isDarkMode.value = !!value
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(THEME_KEY, value ? 'dark' : 'light')
      } catch (e) {
        // 存不了就算了，不影响本次会话的切换
      }
    }
  }

  function toggleTheme() {
    setDarkMode(!isDarkMode.value)
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
    verifyModalOpen,
    isDarkMode,

    // 方法
    openLoginModal,
    closeLoginModal,
    openVerifyModal,
    closeVerifyModal,
    setDarkMode,
    toggleTheme,
  }
})
