<template>
  <!-- 顶部导航栏 -->
  <div class="header-bar" :class="{ 'is-scrolled': isScrolled }">
    <!-- 左侧：Logo + 标题 -->
    <div class="header-bar-left">
      <IconHome class="iconHome" :size="24" />
      <span class="header-bar-title">{{ $route.meta.title }}</span>
    </div>
    <!-- 中间：搜索框 -->
    <div class="header-bar-center">
      <InputSearch v-model="searchText" placeholder="搜索..." @search="onSearch" />
    </div>
    <!-- 右侧：大中屏功能区 -->
    <div class="header-bar-right">
      <div class="header-bar-switch">
        <el-switch
          v-model="uiStore.isDarkMode"
          :active-action-icon="IconDark"
          :inactive-action-icon="IconLight"
        />
      </div>
      <div class="header-bar-login">
        <el-button @click="handleLogin" color="var(--header-bar-button-login-bg)">
          登录
        </el-button>
      </div>
      <div class="header-bar-message">
        <IconMessage class="iconMessage" :size="24" />
      </div>
      <div class="header-bar-contact">
        <el-icon :size="24" class="iconContact"><Promotion /></el-icon>
      </div>
      <div class="header-bar-publish">
        <el-button color="var(--header-bar-button-publish-bg)">
          <el-icon size="large" color="#fff"><UploadFilled /></el-icon>
          <span style="margin-left: 5px; color: white">发布</span>
        </el-button>
      </div>
    </div>
  </div>
</template>
<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from "vue";
import { Expand, Fold, UploadFilled, Promotion, Search } from "@element-plus/icons-vue";
import IconHome from "@/components/icons/IconHome.vue";
import IconLight from "@/components/icons/IconLight.vue";
import IconDark from "@/components/icons/IconDark.vue";
import IconMessage from "@/components/icons/IconMessage.vue";
import InputSearch from "@/components/inputs/InputSearch.vue";
import { useScroll } from "@/utils/useScroll";
import { useUserStore } from "@/stores/user";
import { useUIStore } from "@/stores/ui";

const navbar = document.querySelector(".header-bar");
const navbarHeight = navbar?.offsetHeight || 55;
const { isScrolled } = useScroll(navbarHeight);
const userStore = useUserStore();
const uiStore = useUIStore();


const searchText = ref("");

function onSearch({ keyword, type }) {
  console.log('搜索关键词:', keyword, '类型:', type);
  // 调用 API
}

//导航栏上的登录按键处理
function handleLogin() {
  // 判断是否登录
  if (userStore.isLogin) {
  } else {
    uiStore.openLoginModal();
  }
}


function goPublish() {
  // TODO: 跳转发布页或打开发布弹窗
  closeMobileMenu();
}
</script>

<style scoped>
.header-bar {
  position: absolute;
  top: 0;
  z-index: 1002;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0;
  width: 100%;
  background-color: var(--header-bar-bg);
  height: var(--header-bar-height);
  max-height: var(--header-bar-max-height);
}

.header-bar.is-scrolled {
  position: fixed;
  background-color: var(--header-bar-bg-scrolled);
  box-shadow: 0 2px 12px 0 var(--header-bar-bg-scrolled-shadow);
}

.header-bar-logo {
  font-size: 20px;
  font-family: "Ma Shan Zheng", sans-serif;
  color: var(--header-bar-logo);
}

.header-bar-title {
  font-size: 14px;
  color: var(--header-title);
}

.header-bar.is-scrolled .header-bar-title {
  color: var(--header-title-scrolled);
}

.header-bar-left {
  position: relative;
  height: 100%;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  padding-left: 20px;
  min-width: 100px;
}

.header-bar-center {
  position: relative;
  height: 100%;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 200px;
}

.header-bar-right {
  position: relative;
  height: 100%;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 20px;
  padding-right: 20px;
  min-width: 200px;
}

.header-bar-switch,
.header-bar-login,
.header-bar-message,
.header-bar-contact,
.header-bar-publish {
  display: flex;
  align-items: center;
  justify-content: center;
}

.iconHome {
  color: var(--header-bar-logo);
}

.iconMessage,
.iconContact {
  color: var(--header-bar-icon);
  transition: transform 0.3s ease;
}

.iconMessage:hover,
.iconContact:hover {
  transform: scale(1.2);
}

.header-bar.is-scrolled .iconMessage,
.header-bar.is-scrolled .iconContact {
  color: var(--header-bar-icon-scrolled);
}

.el-switch {
  --el-switch-off-color: var(--bg-primary);
  --el-switch-on-color: var(--bg-secondary);
  --el-switch-border-color: var(--border-color);
}

:deep(.icon-dark),
:deep(.icon-light) {
  color: var(--header-bar-icon-switch);
}

.header-bar-login .el-button {
  height: 36px;
  width: 36px;
  border-radius: 50%;
  color: var(--header-bar-button);
  font-size: 14px;
}

.header-bar-publish .el-button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  width: 100%;
  border-radius: 10px;
}


/* 小屏 (<768px) */
@media (max-width: 767px) {
  .header-bar {
    display: none !important;
  }
}

/* 中屏 (768px ~ 1023px) */
@media (min-width: 768px) and (max-width: 1023px) {
  .header-bar-right {
    gap: 12px; /* 减小间距 */
  }

  .header-bar-publish span {
    display: none; /* 隐藏“发布”文字，只留图标 */
  }

  .header-bar-contact{
    display: none;   
  }
}
</style>
