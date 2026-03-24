<template>
  <div class="space-app">
    <TopNavbar @search="handleGlobalSearch" />
    <div class="header-banner">
      <img class="banner-img" src="@/assets/images/bgbili.png" alt="banner" />
    </div>
    <div ref="mainView" class="app-main">
      <aside class="sidebar-left">
        <span class="sidebar-left-title"> 个 人 中 心 </span>
        <ul class="sidebar-left-list">
          <li
            class="list-item"
            v-for="(menu, index) in menuList"
            :key="menu.key"
            :class="{ 'is-actived': currentActived === menu.key }"
            @click="handleMenuClick(menu.key)"
          >
            <i class="list-item-icon">
              <component :is="menu.icon" size="20"></component>
            </i>
            <span class="list-item-text">{{ menu.text }}</span>
          </li>
        </ul>
      </aside>

      <main class="main-content"></main>

      <aside class="sidebar-right"></aside>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import IconHome from "@/components/icons/IconHome.vue";
import IconUser from "@/components/icons/IconUser.vue";
import IconMessage from "@/components/icons/IconMessage.vue";
const currentActived = ref("home");
const menuList = [
  { key: "home", text: "首  页", icon: IconHome },
  { key: "user", text: "账号管理", icon: IconUser },
  { key: "post", text: "动态管理", icon: IconMessage },
];

const handleMenuClick = (menuKey) => {
  currentActived.value = menuKey;
  console.log(currentActived.value);
};

const handleGlobalSearch = (value) => {
  console.log(value);
};
</script>

<style scoped>
.space-app {
  width: 100%;
  height: 100%;
}

.header-banner {
  position: relative;
  justify-content: center;
  margin: 0 auto;
  width: 100%;
  min-width: var(--header-min-width);
  height: var(--header-banner-height);
  /*   max-height: var(--header-banner-max-height); */
  background-color: var(--header-banner-bg);
  background-position: center 0;
  background-size: cover;
  background-repeat: no-repeat;
  display: inline-block;
  user-select: none;
  overflow: visible;
}

.banner-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.app-main {
  position: relative;
  display: flex;
  height: 100%;
  transition: background-color 0.7s ease, color 0.7s ease;
}

.sidebar-left {
  /*   flex: 1; */
  width: 200px;
  height: 100vh;
  margin-top: -6px;
  border-top: none;
  border: 1px solid var(--border-color);
  transition: background-color 0.7s ease, color 0.7s ease;
}

.sidebar-left-title {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  font-size: 16px;
  font-weight: 500;
  padding: 15px 40px;
  color: var(--text-secondary);
/*   border-bottom: 1px solid var(--border-color); */
  color: #d62bc4;
  background-color: #f6d7d7;
}

.sidebar-left-list {
  list-style: none;
  padding: 0;
  margin: 0;
  /* border-bottom: 1px solid #e1e2e5; */
}

.list-item {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  padding: 15px 30px;
  cursor: pointer;
/*   border-bottom: 1px solid #e1e2e5; */
  user-select: none;
  color: #d62bc4;
  background-color: #f6d7d7;
}

.list-item.is-actived {
  background-color: #e4a98b;
  color: #d62bc4;
}

.list-item:not(.is-actived):hover {
  background-color: #eec8b5;
  color: #d62bc4;
}

.list-item-icon {
  display: flex;
  align-items: center;
}

.sidebar-right {
  flex: 1;
  height: 100%;
}

.main-content {
  position: relative;
  flex: 8;
  height: 100%;
  max-width: 800px;
  min-height: 100vh;
}
</style>
