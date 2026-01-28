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
        <Dropdown menuClass="dropdown-menu--login" :offsetY="10" :showArrow="false" >
          <template #trigger>
            <div class="dropdown-trigger">
              <div v-if="userStore.isLogin">
                <div class="login-avatar">
                  <Avatar
                    :src="userStore.user.avatar"
                    :alt="userStore.user.name"
                    :size="36"
                  />
                </div>
              </div>
              <div v-else>
                <Button type="bilibili" class="login-button" @click="handleLogin">
                  <span>登录</span>
                </Button>
              </div>
            </div>
          </template>
          <template #menu="{ close }">
            <div v-if="userStore.isLogin">
              <div class="dropdown-item">
                <IconUser class="iconUser" :size="18" />
                <span>个人中心</span>
              </div>
              <div class="dropdown-item">
                <IconLogout class="iconLogout" :size="18" />
                <span @click="handleLogout"> 退出登录 </span>
              </div>
            </div>
            <div v-else>
              <div class="dropdown-item">
                <span>登录更多精彩</span>
              </div>
            </div>
          </template>
        </Dropdown>
      </div>
      <div class="header-bar-message" data-tippy-content="消息">
        <IconMessage class="iconMessage" :size="24" />
      </div>
      <div class="header-bar-contact">
        <IconContact class="iconContact" :size="24" />
      </div>
      <div class="header-bar-publish">
        <Button
          class="publish-button"
          backgroundColor="var(--header-bar-button-publish-bg)"
          hoverBackgroundColor="var(--header-bar-button-publish-bg-hover)"
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

const navbar = document.querySelector(".header-bar");
const navbarHeight = navbar?.offsetHeight || 54;
const { isScrolled } = useScroll(navbarHeight);
const userStore = useUserStore();
const uiStore = useUIStore();

const searchText = ref("");
const emit = defineEmits(["search"]); // 声明 emit 事件

function onSearch({ keyword, type }) {
  console.log("搜索关键词:", keyword, "类型:", type);
  emit("search", { keyword, type });
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

function handleLogout() {
  userStore.logout();
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
  transition: background-color 0.7s ease, color 0.7s ease;
}

.header-bar.is-scrolled {
  position: fixed;
  background-color: var(--header-bar-bg-scrolled);
  box-shadow: 0 2px 12px 0 var(--header-bar-bg-scrolled-shadow);
}

.header-bar-logo {
  font-size: 1.2rem;
  font-family: "Ma Shan Zheng", sans-serif;
  color: var(--header-bar-logo);
}

.header-bar-title {
  font-size: 0.9rem;
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
  user-select: none;
}

.login-button {
  height: 36px;
  width: 36px;
  border-radius: 50%;
  font-size: 0.9rem;
  padding: 0px;
}

.dropdown-trigger {
  display: inline-flex;
  cursor: pointer;
}


.login-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-avatar:hover{
  transform: scale(1.2);
}


.dropdown-item {
  color: var(--text-secondary);
  background-color: transparent;
  height: 40px;
  margin: 10px, 0;
  padding: 10px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  cursor: pointer;
  font-size: .9rem;
}

.dropdown-item span {
  margin-left: 12px;
  font-weight: 500;
}

.dropdown-item:hover,
.dropdown-item:focus {
  color: var(--text-primary);
  background-color: var(--bg-hover);
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
.dropdown-menu--login {
  width: 200px;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  padding: 10px;
  background-color: var(--bg-primary);
}
</style>
