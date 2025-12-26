// stores/ui.js
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useUIStore = defineStore('ui', () => {
    const loginModalOpen = ref(false)
    const isDarkMode = ref(false)

    function openLoginModal() {
        loginModalOpen.value = true
    }

    function closeLoginModal() {
        loginModalOpen.value = false
    }

    function toggleTheme() {
        isDarkMode.value = !isDarkMode.value
    }
    

    return {
        loginModalOpen, openLoginModal, closeLoginModal, isDarkMode,
        toggleTheme
    }
})
