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
    <div class="header-bar-right" v-show="!isMobile">
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
      <div class="header-bar-contact" v-if="isMediumOrLarge">
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
  <div class="header-bar-mobile">
    <div class="mobile-menu-button" @click="toggleMobileMenu">
      <el-icon size="24"><Expand /></el-icon>
    </div>
    <div class="mobile-bar-logo">
      <img
        src="@/assets/images/logo.png"
        style="height: 50px; width: 179px; object-fit: cover; display: block"
      />
    </div>
    <div class="mobile-search-button" @click="toggleSearchMenu">
      <el-icon size="24"><Search /></el-icon>
    </div>
  </div>

  <el-drawer class="moblie-menu" v-model="isMobileMenuOpen" :direction="'ltr'" resizable size="300px">
    This is drawer content.
  </el-drawer>

  <!-- 顶部宣传图 -->
  <div class="header-banner">
    <img
      src="@/assets/images/bgTop.jpg"
      style="height: 100%; width: 100%; object-fit: cover; display: block"
    />
    <div class="header-banner-overlay"></div>
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

// 响应式状态
const windowWidth = ref(window.innerWidth);
const isMobile = computed(() => windowWidth.value < 768);
const isMediumOrLarge = computed(() => windowWidth.value >= 1023);

// 移动端菜单
const isMobileMenuOpen = ref(false);

const searchText = ref("");

function onSearch(keyword) {
  console.log("执行搜索:", keyword);
}

//导航栏上的登录按键处理
function handleLogin() {
  // 判断是否登录
  if (userStore.isLogin) {
  } else {
    uiStore.openLoginModal();
  }
}

function toggleMobileMenu() {
  isMobileMenuOpen.value = !isMobileMenuOpen.value;
}

function toggleSearchMenu() {
  // TODO: 显示搜索框
  console.log("显示搜索框");
}

function closeMobileMenu() {
  isMobileMenuOpen.value = false;
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

/* 移动端导航栏 */
.header-bar-mobile {
  position: fixed;
  top: 0;
  z-index: 1002;
  display: none;
  align-items: center;
  justify-content: space-between;
  padding: 0;
  width: 100%;
  background-color: var(--header-bar-bg);
  height: var(--header-bar-height);
  max-height: var(--header-bar-max-height);
  min-width: 350px;
  background-color: var(--header-bar-bg-scrolled);
  box-shadow: 0 2px 12px 0 var(--header-bar-bg-scrolled-shadow);
}

.mobile-menu-button {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  width: 40px;
  margin-left: 10px;
  cursor: pointer;
}

/* 移动端导航logo*/
.mobile-bar-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.mobile-search-button {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  width: 40px;
  margin-right: 10px;
  cursor: pointer;
}



.mobile-menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  font-size: 16px;
  color: #333;
  cursor: pointer;
  border-bottom: 1px solid #f0f0f0;
}

.mobile-menu-item:hover {
  background: #f9f9f9;
}

.mobile-menu-item.publish-btn {
  background: #fb7299;
  color: white;
  border: none;
  border-radius: 8px;
  margin: 0 20px;
}

.mobile-menu-item.publish-btn:hover {
  background: #e95a88;
}

/* ===== 响应式断点 ===== */

/* 小屏 (<768px) */
@media (max-width: 767px) {
  .header-bar {
    display: none !important;
  }
  .header-banner {
    display: none !important;
  }
  .header-bar-mobile {
    display: flex;
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
}
</style>
