// stores/ui.js
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useUIStore = defineStore('ui', () => {
    const loginModalOpen = ref(false)

    function openLoginModal() {
        loginModalOpen.value = true
    }

    function closeLoginModal() {
        loginModalOpen.value = false
    }
    return {loginModalOpen, openLoginModal, closeLoginModal }
})
