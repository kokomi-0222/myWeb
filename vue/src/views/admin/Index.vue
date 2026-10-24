<template>
  <div class="admin-app">
    <!-- 左侧导航 -->
    <aside class="admin-side">
      <div class="admin-brand" @click="goFront">
        <span class="admin-brand__mark">K</span>
        <span class="admin-brand__text">
          <strong>心海的小窝</strong>
          <small>管理后台</small>
        </span>
      </div>

      <nav class="admin-nav">
        <RouterLink
          v-for="item in menuList"
          :key="item.path"
          :to="item.path"
          class="admin-nav__item"
          exact-active-class="is-active"
        >
          <component :is="item.icon" :size="18" />
          <span>{{ item.text }}</span>
        </RouterLink>
      </nav>

      <div class="admin-side__foot">
        <button type="button" class="admin-back" @click="goFront">
          <IconHome :size="16" />
          <span>返回前台</span>
        </button>
      </div>
    </aside>

    <!-- 右侧内容 -->
    <div class="admin-body">
      <header class="admin-top">
        <h1 class="admin-top__title">{{ pageTitle }}</h1>
        <div class="admin-top__right">
          <button
            type="button"
            class="admin-top__icon"
            :title="uiStore.isDarkMode ? '切换为浅色模式' : '切换为深色模式'"
            @click="uiStore.toggleTheme()"
          >
            <IconDark v-if="uiStore.isDarkMode" :size="17" />
            <IconLight v-else :size="17" />
          </button>
          <span class="admin-top__divider"></span>
          <Avatar
            :src="userStore.user?.avatar"
            :alt="userStore.user?.name"
            :size="30"
          />
          <span class="admin-top__name">{{ userStore.user?.name || "管理员" }}</span>
        </div>
      </header>

      <main class="admin-content">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useRoute } from "vue-router";
import router from "@/router";
import IconDashboard from "@/components/icons/IconDashboard.vue";
import IconUser from "@/components/icons/IconUser.vue";
import IconFlag from "@/components/icons/IconFlag.vue";
import IconShield from "@/components/icons/IconShield.vue";
import IconHome from "@/components/icons/IconHome.vue";
import IconDark from "@/components/icons/IconDark.vue";
import IconLight from "@/components/icons/IconLight.vue";
import { useUIStore } from "@/stores/ui";
import { useUserStore } from "@/stores/user";

const route = useRoute();
const uiStore = useUIStore();
const userStore = useUserStore();

const menuList = [
  { path: "/admin/dashboard", text: "概览", icon: IconDashboard },
  { path: "/admin/users", text: "用户管理", icon: IconUser },
  { path: "/admin/roles", text: "角色权限", icon: IconShield },
  { path: "/admin/topics", text: "话题管理", icon: IconFlag },
];

// 顶栏标题跟着路由的 meta.name 走，加新页面时只改路由表
const pageTitle = computed(() => route.meta?.name || "管理后台");

const goFront = () => router.push("/");
</script>

<style scoped>
.admin-app {
  display: flex;
  width: 100%;
  height: 100vh;
  background: var(--bg-secondary);
  color: var(--text-primary);
  overflow: hidden;
}

/* ---------------- 侧边栏 ---------------- */
.admin-side {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  width: 210px;
  padding: 16px 12px;
  background: var(--bg-primary);
  border-right: 1px solid var(--border-color);
}

.admin-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 6px 18px;
  cursor: pointer;
  user-select: none;
}

.admin-brand__mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: var(--primary-color);
  color: #fff;
  font-size: 0.95rem;
  font-weight: 700;
  flex-shrink: 0;
}

.admin-brand__text {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
  min-width: 0;
}

.admin-brand__text strong {
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
}

.admin-brand__text small {
  font-size: 0.6875rem;
  color: var(--text-secondary);
}

.admin-nav {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.admin-nav__item {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 38px;
  padding: 0 11px;
  border-radius: 9px;
  color: var(--text-secondary);
  font-size: 0.875rem;
  text-decoration: none;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.admin-nav__item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.admin-nav__item.is-active {
  background: var(--primary-color-soft);
  color: var(--primary-color);
  font-weight: 600;
}

.admin-side__foot {
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.admin-back {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 36px;
  padding: 0 11px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.8125rem;
  cursor: pointer;
  text-align: left;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.admin-back:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

/* ---------------- 右侧 ---------------- */
.admin-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.admin-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  height: 56px;
  padding: 0 24px;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.admin-top__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
}

.admin-top__right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.admin-top__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.admin-top__icon:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.admin-top__divider {
  width: 1px;
  height: 18px;
  background: var(--border-color);
}

.admin-top__name {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

@media (max-width: 900px) {
  .admin-app {
    flex-direction: column;
  }

  .admin-side {
    width: 100%;
    padding: 10px 12px;
    border-right: none;
    border-bottom: 1px solid var(--border-color);
  }

  .admin-brand {
    padding: 0 0 10px;
  }

  .admin-brand__text small {
    display: none;
  }

  /* 小屏导航横向滚动，避免把内容区挤扁 */
  .admin-nav {
    flex-direction: row;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 2px;
  }

  .admin-nav__item {
    height: 32px;
    padding: 0 12px;
    white-space: nowrap;
    font-size: 0.8125rem;
  }

  .admin-side__foot {
    display: none;
  }

  .admin-top {
    height: 48px;
    padding: 0 14px;
  }

  .admin-top__name {
    display: none;
  }

  .admin-content {
    padding: 14px;
  }
}
</style>

<!-- 不加 scoped：后台各页（含 Teleport 出去的弹窗）都用这一个尺寸，
     避免每个页面各写一遍 padding/圆角，写漏了按钮就退化成浏览器默认样式 -->
<style>
.admin-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  padding: 0 16px;
  border-radius: 8px;
  font-family: inherit;
  font-size: 0.8125rem;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
}

/* 页面级主操作（如「新建角色」）：跟站内顶栏登录按钮同一规格，略大一号 */
.admin-btn--lead {
  height: 34px;
  padding: 0 18px;
  border-radius: 10px;
}
</style>
