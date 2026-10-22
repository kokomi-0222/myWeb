<template>
  <!-- 顶部导航栏 -->
  <div class="header-bar" :class="{ 'is-scrolled': isScrolled }">
    <!-- 左侧：Logo + 标题 -->
    <div class="header-bar-left">
      <div class="brand" @click="gotoMainPage">
        <IconHome class="iconHome" :size="24" />
        <span class="brand-name">心海的小窝</span>
      </div>
      <span class="header-bar-title" @click="gotoMainPage">首页</span>
    </div>
    <!-- 中间：搜索框 -->
    <div v-if="showTools" class="header-bar-center">
      <InputSearch v-model="searchText" placeholder="搜索..." :search-types="searchOptions" @search="onSearch" />
    </div>
    <!-- 右侧：大中屏功能区 -->
    <div
      class="header-bar-right"
      :style="{ visibility: userStore.isLoading ? 'hidden' : 'visible' }"
    >
      <div v-if="showTools" class="header-bar-switch">
        <button
          class="theme-toggle"
          :title="uiStore.isDarkMode ? '切换为浅色模式' : '切换为深色模式'"
          @click="uiStore.toggleTheme()"
        >
          <IconDark v-if="uiStore.isDarkMode" :size="18" />
          <IconLight v-else :size="18" />
        </button>
      </div>
      <div v-if="showTools" class="header-bar-login">
        <!-- 已登录：头像 + 下拉菜单 -->
        <Dropdown
          v-if="userStore.isLogin"
          menuClass="dropdown-menu--login"
          placement="bottom-end"
          :offset-y="10"
          :show-arrow="false"
        >
          <template #trigger>
            <div class="dropdown-trigger">
              <div class="login-avatar">
                <Avatar
                  :src="userStore.user.avatar"
                  :alt="userStore.user.name"
                  :badge="userStore.user.badge"
                  :size="36"
                />
              </div>
            </div>
          </template>
          <template #menu="{ close }">
            <div class="user-menu">
              <!-- 用户信息头部 -->
              <div class="user-menu__header">
                <Avatar
                  class="user-menu__avatar"
                  :src="userStore.user.avatar"
                  :alt="userStore.user.name"
                  :badge="userStore.user.badge"
                  :size="46"
                />
                <div class="user-menu__identity">
                  <div class="user-menu__name-row">
                    <span
                      class="user-menu__name"
                      :style="{ color: userStore.user.nameColor || undefined }"
                    >
                      {{ userStore.user.name }}
                    </span>
                    <span v-if="roleLabel" class="user-menu__badge">{{ roleLabel }}</span>
                  </div>
                  <div class="user-menu__sub" :title="userStore.user.signature || ''">
                    {{ userStore.user.signature || "@" + userStore.user.username }}
                  </div>
                </div>
              </div>

              <div class="user-menu__divider"></div>

              <button type="button" class="user-menu__item" @click="goWithClose(close, '/space/home')">
                <IconUser :size="17" />
                <span>个人中心</span>
              </button>

              <button type="button" class="user-menu__item" @click="goWithClose(close, '/space/account')">
                <IconLock :size="17" />
                <span>账号设置</span>
              </button>

              <div class="user-menu__divider"></div>

              <button
                type="button"
                class="user-menu__item user-menu__item--danger"
                @click="handleLogout"
              >
                <IconLogout :size="17" />
                <span>退出登录</span>
              </button>
            </div>
          </template>
        </Dropdown>
        <!-- 未登录：直接开登录弹窗，不再挂一个只有一句话的空下拉 -->
        <Button v-else type="bilibili" class="login-button" @click="handleLogin">
          <span>登录</span>
        </Button>
      </div>
      <!--  <div v-if="showTools" class="header-bar-message" data-tippy-content="消息">
        <IconMessage class="iconMessage" :size="24" />
      </div>
      <div v-if="showTools" class="header-bar-contact">
        <IconContact class="iconContact" :size="24" />
      </div> -->
      <div v-if="showTools" class="header-bar-publish">
        <Button
          class="publish-button"
          backgroundColor="var(--header-bar-button-publish-bg)"
          hoverBackgroundColor="var(--header-bar-button-publish-bg-hover)"
          @click="goPublish"
        >
          <IconUpload size="18px" color="#fff" />
          <span style="margin-left: 5px; color: white">发布</span>
        </Button>
      </div>
    </div>
  </div>
</template>
<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from "vue";
import { useScroll } from "@/utils/useScroll";
import { useUserStore } from "@/stores/user";
import { useUIStore } from "@/stores/ui";
import IconLight from "@/components/icons/IconLight.vue";
import IconDark from "@/components/icons/IconDark.vue";
import router from "@/router";

const navbar = document.querySelector(".header-bar");
const navbarHeight = navbar?.offsetHeight || 54;
const { isScrolled } = useScroll(navbarHeight);
const userStore = useUserStore();
const uiStore = useUIStore();

defineProps({
  showTools: { type: Boolean, default: true },
});

const searchText = ref("");
const searchOptions = reactive([
  { label: "内容", value: "content" },
  { label: "标题", value: "title" },
  { label: "用户", value: "user" },
  { label: "分类", value: "category" },
]);
const emit = defineEmits(["search"]); // 声明 emit 事件

// 当前角色中文名（用于下拉里的徽章）
const roleLabel = computed(() => userStore.primaryRole?.name || "");

function onSearch({ keyword, type }) {
  console.log("搜索关键词:", keyword, "类型:", type);
  emit("search", { keyword, type });
  // 调用 API
}

//导航栏上的登录按键处理
function handleLogin() {
  if (userStore.isLogin) return;
  uiStore.openLoginModal();
}

function handleLogout() {
  userStore.logout();
  router.push("/").then(() => {
    router.go(0);
  });
}

function goPublish() {
  if (!userStore.isLogin) {
    return;
  }
  router.push("/space/home").then(() => {
    router.go(0);
  });
}

// 下拉里跳转前先收起菜单，避免菜单停留在页面上
function goWithClose(close, path) {
  if (typeof close === "function") close();
  router.push(path).then(() => {
    router.go(0);
  });
}

//去往首页
const gotoMainPage = () => {
  router.push("/").then(() => {
    router.go(0);
  });
};
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
  transition: background-color 0.7s ease, color 0.7s ease;
}

.header-bar.is-scrolled {
  position: fixed;
  background-color: var(--header-bar-bg-scrolled);
  box-shadow: 0 2px 12px 0 var(--header-bar-bg-scrolled-shadow);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

/* 品牌块：图标 + 站点名 */
.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  transition:
    transform 0.2s ease,
    opacity 0.2s ease;
}

.brand:hover {
  transform: translateY(-1px);
  opacity: 0.88;
}

.brand-name {
  font-size: 1.05rem;
  font-weight: 700;
  font-family: "Ma Shan Zheng", sans-serif;
  color: var(--header-bar-logo);
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.header-bar.is-scrolled .brand-name {
  color: var(--header-title-scrolled);
}

.header-bar.is-scrolled .brand:hover .brand-name {
  color: var(--primary-color);
}

/* 导航项：胶囊化 */
.header-bar-title {
  padding: 6px 14px;
  border-radius: 16px;
  font-size: 0.9rem;
  color: var(--header-title);
  cursor: pointer;
  white-space: nowrap;
  transition:
    color 0.2s ease,
    background-color 0.2s ease;
}

.header-bar-title:hover {
  background: rgba(255, 255, 255, 0.25);
  color: #fff;
}

.header-bar.is-scrolled .header-bar-title {
  color: var(--header-title-scrolled);
}

.header-bar.is-scrolled .header-bar-title:hover {
  background: var(--bg-hover);
  color: var(--primary-color);
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

/* 大屏：搜索框相对整条导航栏绝对居中 */
@media (min-width: 1024px) {
  .header-bar-center {
    position: absolute;
    left: 50%;
    top: 0;
    transform: translateX(-50%);
    width: 400px;
    max-width: 40vw;
    min-width: 0;
    /* 绝对定位后脱离 flex 排列，左右两个容器各占 50% 宽并绘制在其上层，
       会把搜索框右半段（含清除/搜索按钮）盖住导致点不到，必须显式提层 */
    z-index: 2;
  }
}

.header-bar-right {
  position: relative;
  z-index: 1;
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
  user-select: none;
}

/* 登录按钮：蓝色实底，与「发布」同尺寸同圆角 */
.login-button {
  height: 34px;
  padding: 0 18px;
  border-radius: 10px;
  font-size: 0.9rem;
  font-weight: 500;
  background-color: var(--primary-color);
  border: 1px solid transparent;
  color: #fff;
  box-shadow: 0 2px 8px rgba(0, 174, 236, 0.3);
  transition:
    background-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;
}

.login-button:hover {
  background-color: var(--primary-color-hover);
  color: #fff;
  box-shadow: 0 4px 14px rgba(0, 174, 236, 0.42);
}

.login-button:active {
  transform: scale(0.97);
}

/* 滚动后顶栏变白底，蓝色保持实底即可 */
.header-bar.is-scrolled .login-button {
  background-color: var(--primary-color);
  border-color: transparent;
  color: #fff;
}

.header-bar.is-scrolled .login-button:hover {
  background-color: var(--primary-color-hover);
  color: #fff;
}

/* 主题切换：与登录按钮同款毛玻璃方块，右侧一排形状统一 */
.theme-toggle {
  width: 34px;
  height: 34px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.16);
  color: var(--header-bar-icon);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease,
    transform 0.2s ease;
}

.theme-toggle:hover {
  background: rgba(255, 255, 255, 0.32);
  border-color: rgba(255, 255, 255, 0.75);
}

.theme-toggle:active {
  transform: scale(0.95);
}

.header-bar.is-scrolled .theme-toggle {
  background: var(--bg-nomarl);
  border-color: transparent;
  color: var(--header-bar-icon-scrolled);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.header-bar.is-scrolled .theme-toggle:hover {
  background: var(--bg-hover);
  color: var(--primary-color);
}

.dropdown-trigger {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}

.login-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.login-avatar:hover {
  transform: scale(1.06);
  box-shadow: 0 0 0 3px var(--primary-color-soft);
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

/* 主题图标颜色跟随当前形态 */
.theme-toggle .icon {
  color: inherit;
}

/* 主题图标颜色跟随按钮 */
:deep(.icon-dark),
:deep(.icon-light) {
  color: inherit;
}

.header-bar-publish .publish-button {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 34px;
  width: 68px;
  border-radius: 10px;
  font-weight: 500;
  font-size: 0.9rem;
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
    gap: 14px; /* 减小间距 */
  }

  .header-bar-publish span {
    display: none; /* 隐藏“发布”文字，只留图标 */
  }

  .header-bar-publish .publish-button {
    width: 48px;
  }

  .header-bar-contact {
    display: none;
  }
}
</style>
<style>
/* ===== 头像下拉菜单（Teleport 到 body，需用全局样式） ===== */
.dropdown-menu--login {
  width: 264px;
  padding: 8px;
  box-sizing: border-box;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  box-shadow:
    0 12px 32px rgba(0, 0, 0, 0.12),
    0 2px 8px rgba(0, 0, 0, 0.06);
}

:root.dark .dropdown-menu--login {
  box-shadow:
    0 12px 32px rgba(0, 0, 0, 0.5),
    0 2px 8px rgba(0, 0, 0, 0.35);
}

.user-menu {
  width: 100%;
}

/* 头部：头像 + 昵称/角色 + 签名 */
.user-menu__header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 12px 14px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--primary-color-soft) 0%, transparent 85%);
}

.user-menu__avatar {
  flex-shrink: 0;
  border-radius: 50%;
  box-shadow:
    0 0 0 2px var(--bg-primary),
    0 0 0 4px var(--primary-color-soft);
}

.user-menu__identity {
  flex: 1;
  min-width: 0;
}

.user-menu__name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.user-menu__name {
  font-size: 0.95rem;
  font-weight: 600;
  line-height: 1.3;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 角色徽章 */
.user-menu__badge {
  flex-shrink: 0;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 600;
  line-height: 1.6;
  color: var(--primary-color);
  background: var(--primary-color-soft);
}

/* 签名（没有签名时显示 @username），最多两行 */
.user-menu__sub {
  margin-top: 4px;
  font-size: 0.75rem;
  line-height: 1.45;
  color: var(--text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;
}

.user-menu__divider {
  height: 1px;
  margin: 6px 6px;
  background: var(--border-color);
}

/* 菜单项 */
.user-menu__item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 40px;
  padding: 0 12px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    color 0.18s ease;
}

.user-menu__item + .user-menu__item {
  margin-top: 2px;
}

.user-menu__item svg {
  flex-shrink: 0;
}

.user-menu__item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

/* 退出登录：危险色 */
.user-menu__item--danger:hover {
  background: rgba(245, 63, 63, 0.1);
  color: #f53f3f;
}

:root.dark .user-menu__item--danger:hover {
  background: rgba(245, 63, 63, 0.16);
  color: #ff7875;
}
</style>
