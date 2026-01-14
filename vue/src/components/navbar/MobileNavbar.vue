<template>
  <!-- 移动端导航栏 -->
  <div class="header-bar-mobile">
    <div class="mobile-menu-toggle" @click="toggleDrawer">
      <div class="hamburger" :class="{ active: drawerVisible }">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
    <div class="mobile-bar-logo">
      <img src="@/assets/images/logo.png" />
    </div>
    <div class="mobile-search-button" @click="toggleSearchMenu">
      <IconSearch size="20" color="#4e5358"/> 
    </div>
  </div>
  <!-- 移动端左侧菜单 -->
  <div class="mobile-drawer" :class="{ open: drawerVisible }">
    <div class="drawer-overlay" @click="closeDrawer"></div>
    <div class="drawer-content">
      <button class="close-btn" @click="closeDrawer">×</button>
      <nav class="menu-list">
        <a href="/">首页</a>
        <a href="/about">关于</a>
        <a href="/contact">联系</a>
        <!-- 其他菜单项 -->
      </nav>
    </div>
  </div>
  <!-- 移动端搜索框 -->
  <div class="mobile-search" :class="{ open: searchVisible }">
    <div class="search-overlay" @click="closeSearchMenu"></div>
    <div class="search-content">
      <div class="search-bar">
        <InputLine
          ref="searchInputRef"
          v-model="searchText"
          type="text"
          label="开启搜索..."
          @search="onSearch"
          :search-types="searchOptions"
        />
      </div>
      <div v-if="hotSearchTags.length > 0" class="hot-search-section">
        <div class="hot-search-title">热门搜索</div>
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
import { ref, reactive, nextTick } from "vue";
const drawerVisible = ref(false);
const searchVisible = ref(false);
const searchText = ref("");
const searchInputRef = ref(null);
const searchOptions = reactive([
  { label: "标题", value: "title" },
  { label: "用户", value: "user" },
  { label: "分类", value: "category" },
]);

const hotSearchTags = ref(["鬼泣5", "鬼泣", "尼禄", "但丁", "维吉尔"]);

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

function onSearch(keyword) {
  console.log("执行搜索:", keyword);
}

// 点击热门标签
const handleHotTagClick = (tag) => {
  searchText.value = tag;
  console.log("执行搜索:", tag);
};
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
  box-shadow: 0 2px 12px 0 var(--header-bar-bg-scrolled-shadow);
}

/* 移动端导航logo*/
.mobile-bar-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.mobile-bar-logo img {
  height: 50px;
  width: 179px;
  object-fit: cover;
  display: block;
}

.mobile-search-button {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  width: 40px;
  margin-right: 12px;
  cursor: pointer;
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
  z-index: 999;
}

.drawer-overlay,
.search-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.4);
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.3s ease, visibility 0.3s ease;
}

.drawer-content {
  position: absolute;
  top: 0;
  left: -300px; /* 初始隐藏在左侧 */
  width: 280px;
  height: 100%;
  padding-top: 55px;
  background: var(--bg-primary);
  color: var(--text-primary);
  box-shadow: 2px 0 10px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  transform: translateX(0);
  padding: 20px;
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
  transform: translateX(300px); /* 滑入 */
}

/* 关闭按钮 */
.close-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  font-size: 1.5rem;
  background: none;
  border: none;
  color: var(--text-primary);
  cursor: pointer;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 菜单列表 */
.menu-list {
  margin-top: 60px;
}
.menu-list a {
  display: block;
  padding: 12px 0;
  text-decoration: none;
  color: var(--text-primary);
  font-size: 1.1rem;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

/* 移动端搜索框 */
.mobile-search {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1000;
}

.search-content {
  position: absolute;
  top: -200px;
  width: 100%;
  height: 40wh;
  background: var(--bg-secondary);
  color: var(--text-primary);
  box-shadow: 2px 0 10px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  transform: translateX(0);
  padding: 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.search-bar {
  height: 40px;
  width: 100%;
  margin-top: 10px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.mobile-search.open {
  pointer-events: auto;
}
.mobile-search.open .search-overlay {
  opacity: 1;
  visibility: visible;
}
.mobile-search.open .search-content {
  transform: translateY(calc(200px + var(--header-bar-height))); /* 滑入 */
}

.hot-search-section {
  margin-top: 24px;
  padding: 0 16px;
}

.hot-search-title {
  font-size: 0.9rem;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.hot-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.hot-tag {
  padding: 6px 12px;
  background-color: var(--bg-nomarl);
  border: none;
  border-radius: 4px;
  font-size: 0.8rem;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background-color 0.2s;
}

.hot-tag:hover {
  background-color: var(--bg-hover);
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
