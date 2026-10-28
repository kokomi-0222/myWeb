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

      <nav
        ref="navRef"
        class="admin-nav"
        :class="{ 'can-left': navFade.left, 'can-right': navFade.right }"
        @scroll="syncNavFade"
        @wheel="onNavWheel"
      >
        <RouterLink
          v-for="item in menuList"
          :key="item.path"
          :to="item.path"
          class="admin-nav__item"
          exact-active-class="is-active"
        >
          <component :is="item.icon" :size="18" />
          <span>{{ item.text }}</span>
          <em v-if="item.badge" class="admin-nav__badge">{{ item.badge }}</em>
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
import { computed, watch, ref, onMounted, onBeforeUnmount, nextTick } from "vue";
import { useRoute } from "vue-router";
import router from "@/router";
import IconDashboard from "@/components/icons/IconDashboard.vue";
import IconUser from "@/components/icons/IconUser.vue";
import IconFlag from "@/components/icons/IconFlag.vue";
import IconAlert from "@/components/icons/IconAlert.vue";
import IconShield from "@/components/icons/IconShield.vue";
import IconHome from "@/components/icons/IconHome.vue";
import IconDark from "@/components/icons/IconDark.vue";
import IconLight from "@/components/icons/IconLight.vue";
import { getReportList } from "@/api/reports";
import { useUIStore } from "@/stores/ui";
import { useUserStore } from "@/stores/user";

const route = useRoute();
const uiStore = useUIStore();
const userStore = useUserStore();

// 待处理举报数量：只用来给菜单加个红点，失败就算了，不影响进后台
const pendingReport = ref(0);

async function loadPendingReport() {
  try {
    const res = await getReportList({ pageNum: 1, pageSize: 1, status: 0 });
    if (res.code === 200) {
      pendingReport.value = res.data?.total || 0;
    }
  } catch {
    // 忽略
  }
}

// 每次切回「举报处理」重新拉一次：在那边处理完举报，回到菜单徽标要跟着减
watch(
  () => route.path,
  (path) => {
    if (path.startsWith("/admin")) loadPendingReport();
  },
  { immediate: true }
);

const menuList = computed(() => [
  { path: "/admin/dashboard", text: "概览", icon: IconDashboard },
  { path: "/admin/users", text: "用户管理", icon: IconUser },
  { path: "/admin/roles", text: "角色权限", icon: IconShield },
  { path: "/admin/reports", text: "举报处理", icon: IconAlert, badge: pendingReport.value || 0 },
  { path: "/admin/topics", text: "话题管理", icon: IconFlag },
]);

/* ------------------------------------------------------------------
   窄屏导航横向滚动：让「还能滑」这件事看得见
   ------------------------------------------------------------------
   背景：≤900px 时导航排成一行，5 项共 518px、容器只有 366px，
   屏外还有 152px。手机浏览器会把滚动条自动隐藏，除了被切的半截文字，
   没有任何「还能往右滑」的暗示 —— 用户根本不会想到去滑。

   所以做两件事：
   1. 滚动到哪一侧还有内容，哪一侧就渐隐（CSS mask），滑到底渐隐自动消失，
      被 fade 掉的那半截本身就是提示；同时把那条灰色滚动条隐藏掉。
   2. 路由切换 / 首次进入时，把当前项滚到视口中间 —— 深链接直接进
      「话题管理」时不会看到一个「五项里没有一项高亮」的导航。
   ------------------------------------------------------------------ */
const navRef = ref(null);
const navFade = ref({ left: false, right: false });

function syncNavFade() {
  const el = navRef.value;
  if (!el) return;
  const max = el.scrollWidth - el.clientWidth;
  navFade.value = {
    // 留 4px 容差：某些缩放比下 scrollLeft 取整会差一点，渐隐会一直闪
    left: el.scrollLeft > 4,
    right: max > 4 && el.scrollLeft < max - 4,
  };
}

// 把当前菜单项滚到中间；不居中就会「滑到最右后切回概览，仍停在最右」
function centerActiveNav() {
  const el = navRef.value;
  if (!el || el.scrollWidth <= el.clientWidth + 2) return;
  const active = el.querySelector(".admin-nav__item.is-active");
  if (!active) return;
  const r = active.getBoundingClientRect();
  const nr = el.getBoundingClientRect();
  const delta = r.left - nr.left - (el.clientWidth - r.width) / 2;
  el.scrollTo({ left: el.scrollLeft + delta, behavior: "smooth" });
}

// 鼠标滚轮竖着滚时转成横滑：桌面把窗口拖到 900 以下时，没有触摸也没法横滑，
// 直接滚轮只能滚内容区，导航就变成「只能看到前三项」的死胡同。
function onNavWheel(e) {
  const el = navRef.value;
  if (!el || el.scrollWidth <= el.clientWidth + 2) return;
  if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return; // 已经是横向手势，交给浏览器
  e.preventDefault();
  el.scrollLeft += e.deltaY;
}

let navResizeHandler = null;

onMounted(async () => {
  await nextTick();
  syncNavFade();
  centerActiveNav();
  navResizeHandler = () => syncNavFade();
  window.addEventListener("resize", navResizeHandler);
});

onBeforeUnmount(() => {
  if (navResizeHandler) window.removeEventListener("resize", navResizeHandler);
});

// 字重 / 字号随主题或字体加载变化时总宽会变，路由切换后再校一次
watch(
  () => route.path,
  async () => {
    await nextTick();
    centerActiveNav();
    syncNavFade();
  }
);

// 顶栏标题跟着路由的 meta.name 走，加新页面时只改路由表
const pageTitle = computed(() => route.meta?.name || "管理后台");

const goFront = () => router.push("/");
</script>

<style scoped>
.admin-app {
  display: flex;
  width: 100%;
  height: 100vh;
  /* 手机浏览器地址栏会让 100vh 比可视区更高，底部内容被挡在地址栏后面；
     dvh 跟随可视区变化。旧浏览器不认 dvh 时仍用上面那行 100vh。 */
  height: 100dvh;
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

/* 待处理数量徽标：靠右贴边，数字超过 99 显示 99+ */
.admin-nav__badge {
  margin-left: auto;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: #fb7299;
  color: #fff;
  font-size: 0.68rem;
  font-style: normal;
  line-height: 18px;
  text-align: center;
  box-sizing: border-box;
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
  /* 🔴 关键：窄屏（≤900px）时 .admin-app 变成 column，这里是主轴上的 flex:1。
     flex item 默认 min-height:auto = 内容高度，会被长表格撑到几千像素，
     于是 .admin-content 永远跟内容一样高（没有可滚动余量），多出来的部分
     又被 .admin-app 的 overflow:hidden 裁掉 —— 表现就是「手机上后台滑不动」。
     允许收缩到 0，滚动权交给 .admin-content。 */
  min-height: 0;
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

  /* 小屏导航横向滚动，避免把内容区挤扁。
     条条（scrollbar）直接藏掉：真机上浏览器本来就不画，桌面窄窗口留着一条
     灰杠既脏又难看；「还能滑」的提示改由两端的渐隐 + 被切半截的文字承担。 */
  .admin-nav {
    flex-direction: row;
    gap: 6px;
    overflow-x: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
    -webkit-overflow-scrolling: touch;
  }

  .admin-nav::-webkit-scrollbar {
    display: none;
  }

  /* 右侧还有内容 → 右缘渐隐；滚过之后左侧出现渐隐；滑到底两端都恢复实心。
     渐隐掉的那半截文字本身就是「这儿还能滑」的暗示。 */
  .admin-nav.can-right {
    -webkit-mask-image: linear-gradient(to right, #000 0, #000 calc(100% - 26px), transparent 100%);
    mask-image: linear-gradient(to right, #000 0, #000 calc(100% - 26px), transparent 100%);
  }

  .admin-nav.can-left {
    -webkit-mask-image: linear-gradient(to left, #000 0, #000 calc(100% - 26px), transparent 100%);
    mask-image: linear-gradient(to left, #000 0, #000 calc(100% - 26px), transparent 100%);
  }

  .admin-nav.can-left.can-right {
    -webkit-mask-image: linear-gradient(to right, transparent 0, #000 26px, #000 calc(100% - 26px), transparent 100%);
    mask-image: linear-gradient(to right, transparent 0, #000 26px, #000 calc(100% - 26px), transparent 100%);
  }

  .admin-nav__item {
    flex: 0 0 auto;
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

/* 次要操作（列表行里的「处理 / 查看」）：描边样式。
   .admin-btn 只管尺寸，没给 border / background，纯 <button> 会退化成
   浏览器默认的深色描边 + 灰底，和旁边主题色的按钮完全不是一套语言。 */
.admin-btn--ghost {
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--text-secondary);
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease,
    color 0.15s ease;
}

.admin-btn--ghost:hover:not(:disabled) {
  border-color: var(--primary-color);
  background: var(--primary-color-soft);
  color: var(--primary-color);
}

.admin-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ---------------------------------------------------------------
   下拉选择器：统一用 components/inputs/SelectBox.vue（自绘浮层）。
   别再用原生 <select>：它的展开列表由操作系统绘制，CSS 完全管不到，
   白底 + 方角 + 系统灰高亮条，和站内 32px / 8px 圆角的控件不是一套语言。
   --------------------------------------------------------------- */

</style>
