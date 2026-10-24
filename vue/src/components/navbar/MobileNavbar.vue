<template>
  <!-- 移动端导航栏 -->
  <div
    class="header-bar-mobile"
    :class="{ 'is-search-open': searchVisible, 'is-drawer-open': drawerVisible }"
  >
    <div class="mobile-menu-toggle" @click="toggleDrawer">
      <div class="hamburger" :class="{ active: drawerVisible }">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
    <div class="mobile-bar-brand" @click="go('/')">
      <IconHome :size="22" />
      <span class="mobile-brand-name">心海的小窝</span>
    </div>
    <div
      class="mobile-search-button"
      :class="{ 'is-active': searchVisible }"
      :aria-label="searchVisible ? '关闭搜索' : '搜索'"
      @click="toggleSearchMenu"
    >
      <IconClose v-if="searchVisible" :size="20" />
      <IconSearch v-else size="20" />
    </div>
  </div>
  <!-- 移动端左侧菜单 -->
  <div class="mobile-drawer" :class="{ open: drawerVisible }">
    <div class="drawer-overlay" @click="closeDrawer"></div>
    <div class="drawer-content">
      <!-- 用户信息头部 -->
      <div class="drawer-header">
        <div class="drawer-user" @click="handleLogin">
          <Avatar
            class="drawer-user__avatar"
            :src="userStore.user?.avatar"
            :alt="userStore.user?.name"
            :size="48"
          />
          <div class="drawer-user__info">
            <template v-if="userStore.isLogin">
              <div
                class="drawer-user__name"
                :style="{ color: userStore.user?.nameColor || undefined }"
              >
                {{ userStore.user?.name }}
              </div>
              <div class="drawer-user__sub">@{{ userStore.user?.username }}</div>
            </template>
            <template v-else>
              <div class="drawer-user__name">未登录</div>
              <div class="drawer-user__sub">点击头像，开始创作</div>
            </template>
          </div>
        </div>
        <button class="drawer-close" aria-label="关闭菜单" @click="closeDrawer">
          <IconClose :size="20" />
        </button>
      </div>

      <nav class="drawer-nav">
        <button
          v-for="item in menuItems"
          :key="item.path"
          type="button"
          class="drawer-nav__item"
          :class="{ 'is-active': isActive(item.path) }"
          @click="go(item.path)"
        >
          <component :is="item.icon" :size="20" />
          <span>{{ item.text }}</span>
        </button>

        <button
          v-if="canEnterAdmin"
          type="button"
          class="drawer-nav__item"
          @click="go('/admin/dashboard')"
        >
          <IconDashboard :size="20" />
          <span>管理后台</span>
        </button>

        <!-- 深色模式：做成一个普通菜单项，视觉上与上下行完全同构，
             右侧只留一个状态小字。夹在菜单中间也不会显得突兀。
             位置固定在「退出登录」之前，退出登录永远是最末一项 -->
        <button
          type="button"
          class="drawer-nav__item drawer-nav__item--theme"
          :class="{ 'is-on': uiStore.isDarkMode }"
          :aria-pressed="uiStore.isDarkMode"
          @click="uiStore.toggleTheme()"
        >
          <IconDark :size="20" />
          <span>深色模式</span>
          <span class="theme-state">{{ uiStore.isDarkMode ? "已开启" : "已关闭" }}</span>
        </button>

        <button
          v-if="userStore.isLogin"
          type="button"
          class="drawer-nav__item drawer-nav__item--danger"
          @click="handleLogout"
        >
          <IconLogout :size="20" />
          <span>退出登录</span>
        </button>
      </nav>
    </div>
  </div>
  <!-- 移动端搜索框 -->
  <div class="mobile-search" :class="{ open: searchVisible }">
    <div class="search-overlay" @click="closeSearchMenu"></div>
    <div class="search-content">
      <div class="search-bar">
        <InputSearch
          ref="searchInputRef"
          v-model="searchText"
          placeholder="搜索帖子、用户..."
          :search-types="searchOptions"
          @search="onSearch"
        />
      </div>
      <div v-if="hotSearchTags.length > 0" class="hot-search-section">
        <div class="hot-search-title">热门话题</div>
        <div class="hot-tags">
          <button
            v-for="tag in hotSearchTags"
            :key="tag"
            class="hot-tag"
            @click="handleHotTagClick(tag)"
          >
            {{ tag }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup>
import { ref, reactive, computed, nextTick, watch, onMounted } from "vue";
import { useRoute } from "vue-router";
import router from "@/router";
import { useUserStore } from "@/stores/user";
import { useUIStore } from "@/stores/ui";
import { useTopicStore } from "@/stores/topic";
import IconHome from "@/components/icons/IconHome.vue";
import IconUser from "@/components/icons/IconUser.vue";
import IconMessage from "@/components/icons/IconMessage.vue";
import IconLock from "@/components/icons/IconLock.vue";
import IconLogout from "@/components/icons/IconLogout.vue";
import IconClose from "@/components/icons/IconClose.vue";
import IconDark from "@/components/icons/IconDark.vue";
import IconDashboard from "@/components/icons/IconDashboard.vue";
import InputSearch from "@/components/inputs/InputSearch.vue";
import { usePermission } from "@/utils/usePermission";

const route = useRoute();

// 侧边栏菜单
const menuItems = [
  { path: "/", text: "首页", icon: IconHome },
  { path: "/space/home", text: "动态管理", icon: IconMessage },
  { path: "/space/account", text: "个人信息", icon: IconUser },
  { path: "/space/password", text: "修改密码", icon: IconLock },
];

// 手机端也要能进后台，否则管理员在小屏下没有入口
const { hasPermission } = usePermission();
const canEnterAdmin = computed(
  () => userStore.isLogin && hasPermission("user:manage")
);

const isActive = (path) =>
  path === "/" ? route.path === "/" : route.path.startsWith(path);

const emit = defineEmits(["search", "home"]); // search=搜索，home=点 logo/首页要求重置

const go = (path) => {
  closeDrawer();
  closeSearchMenu();
  if (path === "/") {
    // 已经在首页时路由不会变化，必须让首页自己重置，否则点了没反应
    if (route.path === "/") {
      emit("home");
      return;
    }
    router.push("/");
    return;
  }
  if (route.path !== path) router.push(path);
};

const handleLogout = () => {
  closeDrawer();
  userStore.logout();
};

// 路由变化时收起抽屉
watch(
  () => route.fullPath,
  () => closeDrawer()
);
const drawerVisible = ref(false);
const searchVisible = ref(false);
const searchText = ref("");
const searchInputRef = ref(null);
const searchOptions = reactive([
  { label: "内容", value: "content" },
  { label: "标题", value: "title" },
  { label: "用户", value: "user" },
  { label: "分类", value: "category" },
]);
// 热门话题（与首页左侧话题同源）：只取已经有帖子的话题，最多展示 8 个。
// 空话题也会出现在首页话题栏（站长刚建的），但放进「热门」里会显得没内容。
const topicStore = useTopicStore();
const hotSearchTags = computed(() =>
  topicStore.usedTopics.slice(0, 8).map((t) => t.name)
);
onMounted(() => {
  topicStore.loadTopics();
});

const toggleDrawer = () => {
  drawerVisible.value = !drawerVisible.value;
};

const closeDrawer = () => {
  drawerVisible.value = false;
};

function toggleSearchMenu() {
  searchVisible.value = !searchVisible.value;
  if (searchVisible.value) {
    nextTick(() => {
      searchInputRef.value?.focus();
    });
  }
}

const closeSearchMenu = () => {
  searchVisible.value = false;
};

function onSearch({ keyword, type }) {
  closeSearchMenu();
  emit("search", { keyword, type });
}

// 搜索条件被清掉时（点 logo / 首页 / 浏览器后退），输入框内容同步清空
watch(
  () => route.query.keyword,
  (keyword) => {
    searchText.value = keyword ? String(keyword) : "";
  }
);

// 点击热门话题标签：按关键词搜索
const handleHotTagClick = (tag) => {
  searchText.value = tag;
  closeSearchMenu();
  // 点话题 = 按分类精确筛选（不是全文搜这个词），中文标签由首页统一映射成 type 值
  emit("search", { keyword: tag, type: "category" });
};

const userStore = useUserStore();
const uiStore = useUIStore();

function handleLogin() {
  // 判断是否登录
  if (userStore.isLogin) {
    closeDrawer();
    if (route.path !== "/space/home") router.push("/space/home");
  } else {
    uiStore.openLoginModal();
  }
}
</script>
<style scoped>
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
  min-width: var(--body-min-width);
  background-color: var(--header-bar-bg-scrolled);
  color: var(--header-bar-icon-scrolled);
  box-shadow: 0 2px 12px 0 var(--header-bar-bg-scrolled-shadow);
  transition: background-color 0.25s ease, box-shadow 0.25s ease;
}

/* 面板/抽屉打开时：顶栏转为纯色并与面板连成一体 */
.header-bar-mobile.is-search-open,
.header-bar-mobile.is-drawer-open {
  background-color: var(--bg-primary);
  box-shadow: none;
}

.header-bar-mobile.is-search-open {
  border-bottom: 1px solid var(--border-color);
}

/* 移动端导航品牌块：与桌面版 brand 一致 */
.mobile-bar-brand {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100%;
  min-width: 0;
  cursor: pointer;
  user-select: none;
}

.mobile-bar-brand svg {
  color: var(--header-bar-logo);
  flex-shrink: 0;
}

.mobile-brand-name {
  font-size: 1.1rem;
  font-weight: 700;
  font-family: "Ma Shan Zheng", sans-serif;
  color: var(--header-bar-logo);
  letter-spacing: 0.04em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mobile-search-button {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 34px;
  width: 34px;
  margin-right: 10px;
  color: var(--header-bar-icon-scrolled);
  cursor: pointer;
  border-radius: 50%;
  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    transform 0.2s ease;
}

.mobile-search-button.is-active {
  background-color: var(--primary-color-soft);
  color: var(--primary-color);
}

.mobile-search-button:active {
  transform: scale(0.9);
}

.mobile-menu-toggle {
  position: relative;
  padding: 12px;
  cursor: pointer;
  display: block;
  opacity: 0.7;
  user-select: none;
}

.hamburger {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: 20px;
  height: 15px;
  position: relative;
}

.hamburger span {
  background: currentColor;
  height: 2px;
  border-radius: 2px;
  transition: all 0.3s ease;
}

.hamburger span:nth-child(1) {
  width: 100%;
}
.hamburger span:nth-child(2) {
  width: 70%;
}
.hamburger span:nth-child(3) {
  width: 90%;
}

.hamburger.active span {
  position: absolute;
  left: 0;
  width: 100% !important;
}

.hamburger.active span:nth-child(1) {
  top: 50%;
  transform: translateY(-50%) rotate(45deg);
}

.hamburger.active span:nth-child(2) {
  opacity: 0;
}

.hamburger.active span:nth-child(3) {
  top: 50%;
  transform: translateY(-50%) rotate(-45deg);
}

/* ===== 抽屉容器 ===== */
.mobile-drawer {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1003; /* 高于顶栏(1002)，避免顶栏压住抽屉 */
}

.drawer-overlay,
.search-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(2px);
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.3s ease, visibility 0.3s ease;
}

/* 搜索遮罩不覆盖顶栏，让顶栏与面板连成一体 */
.search-overlay {
  top: var(--header-bar-height);
  height: calc(100% - var(--header-bar-height));
}

.drawer-content {
  position: absolute;
  top: 0;
  left: 0;
  width: 300px;
  max-width: 82vw;
  height: 100%;
  padding: 0;
  /* flex column：让 .drawer-nav 吃掉剩余高度，「外观」就能吸到底部 */
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  color: var(--text-primary);
  border-radius: 0 16px 16px 0;
  box-shadow: 8px 0 32px rgba(0, 0, 0, 0.18);
  transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  transform: translateX(-105%);
  overflow-y: auto;
}

/* 打开状态 */
.mobile-drawer.open {
  pointer-events: auto;
}
.mobile-drawer.open .drawer-overlay {
  opacity: 1;
  visibility: visible;
}
.mobile-drawer.open .drawer-content {
  transform: translateX(0); /* 滑入 */
}

/* ===== 头部：用户信息 ===== */
.drawer-header {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  margin: 16px 12px 8px;
  padding: 14px 12px;
  border-radius: 12px;
  background: linear-gradient(135deg, var(--primary-color-soft) 0%, transparent 85%);
}

.drawer-user {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
  cursor: pointer;
}

.drawer-user__avatar {
  flex-shrink: 0;
  border-radius: 50%;
  box-shadow: 0 0 0 2px var(--bg-primary);
}

.drawer-user__info {
  flex: 1;
  min-width: 0;
}

.drawer-user__name {
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.3;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drawer-user__sub {
  margin-top: 3px;
  font-size: 0.75rem;
  line-height: 1.2;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drawer-close {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background-color 0.18s ease, color 0.18s ease;
}

.drawer-close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

/* ===== 菜单列表 ===== */
.drawer-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  /* 撑满剩余高度，「外观」靠 margin-top:auto 吸底；min-height:0 防内容多时溢出 */
  flex: 1;
  min-height: 0;
  padding: 8px 12px 20px;
}

.drawer-nav__item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  height: 46px;
  flex-shrink: 0;
  padding: 0 14px;
  border: none;
  border-radius: 11px;
  background: transparent;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 0.95rem;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.18s ease, color 0.18s ease;
}

.drawer-nav__item svg {
  flex-shrink: 0;
}

.drawer-nav__item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.drawer-nav__item.is-active {
  background: var(--primary-color-soft);
  color: var(--primary-color);
}

/* 深色模式菜单项：右侧状态小字推到最右 */
.theme-state {
  margin-left: auto;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-secondary);
  transition: color 0.18s ease;
}

.drawer-nav__item--theme.is-on .theme-state {
  color: var(--primary-color);
}

/* 退出登录：危险色 */
.drawer-nav__item--danger {
  margin-top: 8px;
}

.drawer-nav__item--danger:hover {
  background: rgba(245, 63, 63, 0.1);
  color: #f53f3f;
}

:root.dark .drawer-nav__item--danger:hover {
  background: rgba(245, 63, 63, 0.16);
  color: #ff7875;
}

/* 移动端搜索框 */
.mobile-search {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  /* 容器本身永不接收点击：它是全屏 fixed，一旦 auto 就会连顶栏一起吞掉，
     导致右上角的 × 点不动。点击交给遮罩和面板各自处理。 */
  pointer-events: none;
  /* 低于顶栏(1002)：面板从顶栏下方滑出，不需要盖住顶栏 */
  z-index: 1001;
}

.search-content {
  position: absolute;
  top: var(--header-bar-height);
  width: 100%;
  background: var(--bg-primary);
  color: var(--text-primary);
  border-radius: 0 0 20px 20px;
  box-shadow: 0 14px 28px rgba(0, 0, 0, 0.1);
  transition:
    transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1),
    opacity 0.3s ease;
  transform: translateY(-110%);
  opacity: 0;
  padding: 12px 16px 20px;
  overflow-y: auto;
}

/* 移动端搜索框稍微加高，更好点击 */
.search-content :deep(.search-input-wrapper) {
  max-width: 100%;
}

.search-content :deep(.search-form) {
  height: 40px;
  border-radius: 11px;
  background-color: var(--bg-nomarl);
  border-color: transparent;
}

.search-content :deep(.search-form.is-focused) {
  background-color: var(--bg-primary);
  border-color: var(--primary-color);
}

.mobile-search.open .search-overlay,
.mobile-search.open .search-content {
  pointer-events: auto;
}
.mobile-search.open .search-overlay {
  opacity: 1;
  visibility: visible;
}
.mobile-search.open .search-content {
  transform: translateY(0); /* 从顶栏下方滑入 */
  opacity: 1;
}

.search-bar {
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.hot-search-section {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
}

.hot-search-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.hot-search-title::before {
  content: "";
  width: 3px;
  height: 12px;
  border-radius: 2px;
  background: var(--primary-color);
}

.hot-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* 与发布界面的分类标签（views/space/Home.vue 的 .category-tag）保持同一套视觉 */
.hot-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  padding: 0 12px;
  font-size: 0.8rem;
  line-height: 1;
  color: var(--text-secondary);
  background: var(--bg-nomarl);
  border: 1px solid transparent;
  border-radius: 8px;
  font-family: inherit;
  white-space: nowrap;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    color 0.2s ease,
    background-color 0.2s ease,
    border-color 0.2s ease,
    transform 0.15s ease;
}

.hot-tag:active {
  transform: scale(0.94);
}

.hot-tag:hover {
  color: var(--primary-color);
  border-color: var(--primary-color);
}

@media (max-width: 767px) {
  .header-bar-mobile {
    display: flex;
  }
  .mobile-drawer {
    display: block;
  }
  .mobile-search {
    display: block;
  }
}
</style>
