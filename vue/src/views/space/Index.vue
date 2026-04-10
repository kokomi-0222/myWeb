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
            :class="{
              'is-actived': router.currentRoute.value.path === `/space/${menu.path}`,
            }"
            @click="handleMenuClick(menu.path)"
          >
            <i class="list-item-icon">
              <component :is="menu.icon" size="20"></component>
            </i>
            <span class="list-item-text">{{ menu.text }}</span>
          </li>
        </ul>
      </aside>

      <main class="main-content">
        <!-- 面包屑 -->
 <!--        <div class="breadcrumb">
          <span class="breadcrumb-divider">|</span>
          <span class="breadcrumb-item active">{{ currentMenuText }}</span>
        </div> -->

        <RouterView />
      </main>

      <aside class="sidebar-right"></aside>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import IconHome from "@/components/icons/IconHome.vue";
import IconUser from "@/components/icons/IconUser.vue";
import IconMessage from "@/components/icons/IconMessage.vue";
import router from "@/router";

const menuList = [
  { path: "home", text: "首  页", icon: IconHome },
  { path: "account", text: "账号管理", icon: IconUser },
  { path: "posts", text: "动态管理", icon: IconMessage },
];


const currentMenuText = computed(() => {
  const fullPath = router.currentRoute.value.path;
  const menu = menuList.find((m) => `/space/${m.path}` === fullPath);
  return menu?.text ?? "首页";
});

const handleMenuClick = (menuPath) => {
  router.push(menuPath);
  console.log(router.currentRoute.value.path);
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
  min-width: 180px;
  height: auto;
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
  background-color: var(--bg-secondary);
}

.sidebar-left-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.list-item {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  padding: 15px 30px;
  cursor: pointer;
  user-select: none;
  color: var(--text-primary);
  background-color: var(--bg-secondary);
}

.list-item.is-actived {
  background-color: #00A1D7;
  color: #ffffff;
}

.list-item:not(.is-actived):hover {
  background-color: var( --bg-hover);
  color: #424242;
}

.list-item-icon {
  display: flex;
  align-items: center;
  color: #bbb;
}

.list-item.is-actived .list-item-icon{
  color: #eee;
  
} 
/* .list-item-icon:hover {
  opacity: 1;
}
 */

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
/*   border-right: 1px solid var(--border-color); */
}

/* 面包屑 */
.breadcrumb {
  display: flex;
  align-items: center;
  font-size: 0.9rem;
  padding: 0px 20px;
  margin-bottom: 10px;
  background: transparent;

/*   border-bottom: 1px solid var(--border-color); */


  margin-top: -6px;
  margin-left: 0px;
  height:55px;
  font-size: 16px;
  font-weight: 500;
}

.breadcrumb-item {
  padding: 0 4px;
}

.breadcrumb-item.active {
  font-weight: bold;
  color: #d62bc4;
}

.breadcrumb-divider {
  margin: 0 6px;
  color: #d62bc4;
}
</style>
