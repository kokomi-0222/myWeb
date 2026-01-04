<template>
  <div class="app">
    <TopNavbar />
    <MobileNavbar />
    <div class="header-banner">
      <img
        src="@/assets/images/bgTop.jpg"
        style="height: 100%; width: 100%; object-fit: cover; display: block"
      />
      <div class="header-banner-overlay"></div>
    </div>
    <div class="app-main">
      <aside class="sidebar-left">
        <!-- 导航、分类、快捷入口 -->
      </aside>
      <main class="main-content">
        <div class="sort-bar">
          <div class="sort-title">排序</div>
          <div class="sort-content">
            <span>更新</span>
            <span>浏览</span>
            <span>点赞</span>
            <span>评论</span>
          </div>
        </div>
      </main>
      <aside class="sidebar-right">
        <!-- 热门帖子、广告、在线用户等（桌面端显示） -->
      </aside>
    </div>

    <BottomNavbar />
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

<style scoped>
.app {
  width: 100%;
  height: 100%;
}

.header-banner {
  position: relative;
  z-index: 0;
  justify-content: center;
  margin: 0 auto;
  width: 100%;
  min-width: var(--header-min-width);
  height: var(--header-banner-height);
  max-height: var(--header-banner-max-height);
  background-color: var(--header-banner-bg);
  background-position: center 0;
  background-size: cover;
  background-repeat: no-repeat;
  display: inline-block;
  user-select: none;
  overflow: visible;
}

.header-banner-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: transparent;
  background-color: var(--bg-primary);
  opacity: 0;
}

.app-main {
  position: relative;
  display: flex;
  margin-top: -100px;
  height: 1024px;
  padding: 0 16px;
}

.sidebar-left {
  flex: 1;
  height: 100%;
}

.sidebar-right {
  flex: 1;
  height: 100%;
}

.main-content {
  position: relative;
  flex: 8;
  z-index: 2;
  height: 100%;
  background-color: var(--bg-secondary);
  box-shadow: 0px -2px 6px rgba(0, 0, 0, 0.3);
}

.sort-bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 10px;
  font-size: 14px;
}

.sort-title{
  opacity: 0.5;
  padding-right: 5px;
  border-right: 1px solid var(--input-line-label);
}

.sort-content{
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-left: 10px;
  gap: 10px;
}

/* 小屏 (<768px) */
@media (max-width: 767px) {
  .header-banner {
    display: none !important;
  }
  .sidebar-left,
  .sidebar-right {
    display: none !important;
  }
  .app-main {
    margin-top: 0 !important; /* 移动端不需要上移 */
    padding: 0;
  }
}

/* 中屏 (768px ~ 1023px) */
@media (min-width: 768px) and (max-width: 1023px) {
}
</style>
