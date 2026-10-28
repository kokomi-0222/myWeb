<template>
  <div class="space-app">
    <TopNavbar @search="handleGlobalSearch" />
    <MobileNavbar @search="handleGlobalSearch" />
    <div class="header-banner">
      <img class="banner-img" src="@/assets/images/bgbili.png" alt="banner" />
    </div>
    <div ref="mainView" class="app-main">
      <aside class="sidebar-left">
        <div class="menu-card">
          <div class="menu-card__title">个人中心</div>
          <ul class="menu-list">
            <li
              class="menu-item"
              v-for="menu in menuList"
              :key="menu.key"
              :class="{
                'is-active': router.currentRoute.value.path === `/space/${menu.path}`,
              }"
              @click="handleMenuClick(menu.path)"
            >
              <i class="menu-item__icon">
                <component :is="menu.icon" size="20"></component>
              </i>
              <span class="menu-item__text">{{ menu.text }}</span>
              <span
                v-if="menu.key === 'message' && notifyStore.unread > 0"
                class="menu-item__badge"
              >{{ notifyStore.unread > 99 ? "99+" : notifyStore.unread }}</span>
            </li>
          </ul>
        </div>
      </aside>

      <main class="main-content">
        <RouterView />
      </main>
    </div>

    <!--
      个人中心也要挂登录弹窗：未登录进到 /space/home 时那个「立即登录」按钮
      以前点了没反应（弹窗只挂在首页和详情页）。
    -->
    <LoginModal />
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import IconHome from "@/components/icons/IconHome.vue";
import IconUser from "@/components/icons/IconUser.vue";
import IconMessage from "@/components/icons/IconMessage.vue";
import router from "@/router";
import IconShield from "@/components/icons/IconShield.vue";
import LoginModal from "@/components/modules/LoginModal.vue";
import { useNotificationStore } from "@/stores/notification";

const notifyStore = useNotificationStore();

// 进入个人中心时拉一次未读数，用于「消息管理」的红点
onMounted(() => {
  notifyStore.fetchUnread();
});

// 「用户管理」已独立成 /admin 后台（入口在顶栏），这里不再放管理相关菜单
// 「修改密码」已并进「账号安全」（密码 / 邮箱 / 注销），换图标强调这是敏感操作区
const menuList = [
  { path: "home", text: "首页", key: "home", icon: IconHome },
  { path: "account", text: "我的信息", key: "account", icon: IconUser },
  { path: "message", text: "消息管理", key: "message", icon: IconMessage },
  { path: "security", text: "账号安全", key: "security", icon: IconShield },
];

const handleMenuClick = (menuPath) => {
  router.push(menuPath);
};

const handleGlobalSearch = () => {
  // 空间页暂不处理搜索
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
  display: grid;
  grid-template-columns: 200px minmax(0, 720px);
  justify-content: center;
  gap: 24px;
  /* 底部 48px 是页面收尾留白，替代原来的 min-height: 100vh */
  padding: 20px 24px 48px;
  height: 100%;
  transition: background-color 0.7s ease, color 0.7s ease;
}

/* 侧栏菜单卡片 */
.sidebar-left {
  min-width: 0;
}

.menu-card {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 14px;
  position: sticky;
  top: calc(var(--header-bar-height, 54px) + 16px);
}

.menu-card__title {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text-primary);
  padding: 6px 10px 12px;
}

.menu-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.menu-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 12px;
  border-radius: 8px;
  cursor: pointer;
  user-select: none;
  color: var(--text-secondary);
  font-size: 0.95rem;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.menu-item:not(.is-active):hover {
  background-color: var(--bg-hover);
  color: var(--text-primary);
}

.menu-item.is-active {
  background-color: var(--primary-color-soft);
  color: var(--primary-color);
  font-weight: 600;
}

/* 左侧高亮条 */
.menu-item.is-active::before {
  content: "";
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 3px;
  border-radius: 2px;
  background: var(--primary-color);
}

.menu-item__icon {
  display: flex;
  align-items: center;
  color: inherit;
}

.menu-item__text {
  white-space: nowrap;
}

/* 未读消息数：贴着「消息管理」右侧的小红点 */
.menu-item__badge {
  margin-left: auto;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: #fb7299;
  color: #fff;
  font-size: 0.6875rem;
  font-weight: 600;
  line-height: 18px;
  text-align: center;
  flex-shrink: 0;
}

.main-content {
  position: relative;
  min-width: 0;
  /* 不要给 min-height: 100vh：主内容区从横幅下方开始，撑满一屏会在内容很少时
     （比如账号管理页）多出几百像素空白，滚到底还在往下滑。底部留白交给 .app-main 的 padding */
}

/* 小屏 (<768px) */
@media (max-width: 767px) {
  .header-banner {
    display: none !important;
  }
  .sidebar-left {
    display: none !important;
  }
  .app-main {
    margin-top: 50px !important;
    padding: 0 0 24px;
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }
}
</style>
