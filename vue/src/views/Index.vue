<template>
  <div>
    <TopNavbar />
    <MobileNavbar />
    <BottomNavbar />
    <div
      class="container-left"
      style="display: flex; width: 1000px; height: 1000px"
    ></div>
    <div class="container" style="display: flex; width: 1000px; height: 1000px">
      <div class="container" style="display: flex; width: 1000px; height: 1000px"></div>
    </div>
    <LoginModal />
  </div>
</template>

<script setup>
import { ElMessage } from "element-plus";
import { Search } from "@element-plus/icons-vue";
import TopNavbar from "@/components/navbar/TopNavbar.vue";
import { useUserStore } from "@/stores/user";
import LoginModal from "@/components/modules/LoginModal.vue";
import { watch } from "vue";
import MobileNavbar from "@/components/navbar/MobileNavbar.vue";
import BottomNavbar from "@/components/navbar/BottomNavbar.vue";

const userStore = useUserStore();

watch(
  () => userStore.isLogin,
  (newVal) => {
    if (newVal) {
      // 登录成功后
    }
  }
);
</script>

<style scoped></style>
