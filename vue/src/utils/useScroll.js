// utils/useScroll.js
import { ref, onMounted, onBeforeUnmount } from 'vue'

export function useScroll(threshold) {
  const isScrolled = ref(false)

  const handleScroll = () => {
    isScrolled.value = window.scrollY >= threshold
  }

  onMounted(() => window.addEventListener('scroll', handleScroll))
  onBeforeUnmount(() => window.removeEventListener('scroll', handleScroll))

  return { isScrolled }
}
