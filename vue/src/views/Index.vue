<template>
  <div class="kokomi-app">
    <TopNavbar @search="handleGlobalSearch" @home="handleGoHome" />
    <MobileNavbar @search="handleGlobalSearch" @home="handleGoHome" />
    <div class="header-banner">
      <Banner :enable-layers="false" />
    </div>
    <div ref="mainView" class="app-main">
      <!-- 左侧：话题导航 -->
      <aside class="sidebar sidebar-left">
        <div class="side-card">
          <div class="side-card__title">话题</div>
          <ul class="topic-list">
            <li
              class="topic-item"
              :class="{ 'is-active': !currentType }"
              @click="handleTopicClick('')"
            >
              <span class="topic-dot" style="background: var(--primary-color)"></span>
              <span class="topic-name">全部</span>
            </li>
            <li
              v-for="topic in topics"
              :key="topic.value"
              class="topic-item"
              :class="{ 'is-active': currentType === topic.value }"
              @click="handleTopicClick(topic.value)"
            >
              <span class="topic-dot" :style="{ background: topic.color }"></span>
              <span class="topic-name">{{ topic.name }}</span>
            </li>
          </ul>
        </div>
      </aside>

      <main class="main-content">
        <div class="posts-content">
          <div class="sort-bar">
            <div class="sort-bar__left">
              <h2 class="sort-heading">{{ currentTopicLabel }}</h2>
              <span v-if="posts.total" class="sort-count">共 {{ posts.total }} 篇</span>
            </div>
            <div class="sort-bar__right">
              <span class="sort-label">排序</span>
              <div class="sort-tabs" role="tablist">
                <button
                  v-for="option in sortOptions"
                  :key="option.sortBy"
                  type="button"
                  role="tab"
                  class="sort-tab"
                  :class="{ 'is-active': effectiveSort === option.sortBy }"
                  :aria-selected="effectiveSort === option.sortBy"
                  @click="applySort(option)"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>
          </div>

          <!-- 骨架屏 -->
          <template v-if="posts.loading && posts.list.length === 0">
            <div v-for="n in 3" :key="'sk-' + n" class="post-skeleton">
              <div class="skeleton-avatar"></div>
              <div class="skeleton-lines">
                <div class="skeleton-line" style="width: 30%"></div>
                <div class="skeleton-line" style="width: 90%"></div>
                <div class="skeleton-line" style="width: 65%"></div>
              </div>
            </div>
          </template>

          <PostCard
            v-for="post in posts.list"
            :key="post.id"
            :post="post"
            @like="handleLike"
            @comment="handleComment"
            @reply="handleReply"
            @edit="handleEdit"
            @delete="handleDelete"
          />

          <!-- 无限滚动：加载提示 -->
          <div v-if="!setting.showPagination && posts.loading && hasMore" class="loading">
            <span class="spinner"></span>
            加载中...
          </div>

          <!-- 无限滚动：无更多 -->
          <div
            v-if="!setting.showPagination && !hasMore && posts.list.length > 0"
            class="no-more"
          >
            已经到底啦！
          </div>

          <!-- 初始无数据 -->
          <div v-if="posts.list.length === 0 && !posts.loading" class="empty-state">
            <div class="empty-state__icon">🫧</div>
            <p class="empty-state__title">
              {{ currentType ? "这个话题下还没有帖子" : "还没有任何帖子" }}
            </p>
            <p class="empty-state__desc">
              {{ currentType ? "换个话题看看，或者来发第一篇吧" : "来发第一篇帖子，开启这个社区吧" }}
            </p>
            <button v-if="currentType" class="empty-state__btn" @click="handleTopicClick('')">
              查看全部帖子
            </button>
          </div>
        </div>

        <!-- 分页器（仅分页模式） -->
        <div v-show="shouldShowPagination" class="posts-pagination">
          <Pagination
            :totalItems="posts.total"
            :pageSize="posts.pageSize"
            v-model="posts.currentPage"
            @change="handlePageChange"
          />
        </div>
      </main>

      <!-- 右侧：社区信息 -->
      <aside class="sidebar sidebar-right">
        <div class="side-card">
          <div class="side-card__title">社区数据</div>
          <div class="stat-grid">
            <div class="stat-item">
              <div class="stat-num">{{ siteStats.posts }}</div>
              <div class="stat-label">帖子</div>
            </div>
            <div class="stat-item">
              <div class="stat-num">{{ topics.length }}</div>
              <div class="stat-label">话题</div>
            </div>
          </div>
        </div>
        <div class="side-card">
          <div class="side-card__title">关于</div>
          <p class="about-text">心海的小窝，一个记录日常与分享爱好的小社区。</p>
        </div>
      </aside>
    </div>
    <!-- 页脚：备案号 + 隐私政策 + 联系方式。
         原来是个 48px 的空 div（占位），按《互联网信息服务管理办法》要求，
         经营性/非经营性网站在国内接入都要在首页底部展示备案号。
         分成「版权+备案」和「链接」两组：手机上两组各占一行，
         不分组的写法会把「联系我们」挤到第三行孤零零挂着。 -->
    <footer class="kokomi-footer">
      <div class="kokomi-footer__meta">
        <span>© {{ year }} {{ site.name }}</span>
        <span class="kokomi-footer__sep">·</span>
        <a :href="site.icpUrl" target="_blank" rel="noopener">{{ site.icp }}</a>
      </div>
      <span class="kokomi-footer__sep kokomi-footer__sep--gap">·</span>
      <div class="kokomi-footer__links">
        <RouterLink to="/privacy">隐私政策</RouterLink>
        <span class="kokomi-footer__sep">·</span>
        <a :href="`mailto:${site.contactEmail}`">联系我们</a>
      </div>
    </footer>
    <!-- <BottomNavbar /> -->
    <LoginModal />
  </div>
</template>

<script setup>
import { getPosts } from "@/api/posts";
import { getSiteStats } from "@/api/user";
import setting from "@/config/setting";
import site from "@/config/site";
import { useTopicStore } from "@/stores/topic";
import { useRoute } from "vue-router";
import router from "@/router";

const route = useRoute();

// 页脚版权年份：用运行时年份，免得每年手动改
const year = new Date().getFullYear();

import {
  ref,
  reactive,
  computed,
  onMounted,  onBeforeUnmount,
  watch,
  nextTick,
} from "vue";

// ========== 分类 ==========
const sortOptions = [
  { label: "更新", sortBy: "update" },
  { label: "浏览", sortBy: "views" },
  { label: "点赞", sortBy: "likes" },
  { label: "评论", sortBy: "comments" },
];

// ========== 话题 ==========
// 话题由后端 /topic/list 提供（话题表 + 帖子里实际用到的类型），
// 站长新增话题后这里自动出现，不再需要在多个文件里同步硬编码列表。
const topicStore = useTopicStore();
const topics = computed(() => topicStore.list);
//帖子信息
const posts = reactive({
  list: [],
  total: 0,
  currentPage: 1,
  pageSize: setting.postsPageSize || 10,
  loading: false,
});

// 全站统计（右侧「社区数据」用，不随话题筛选变化）
const siteStats = reactive({ posts: 0, users: 0, comments: 0 });

const loadSiteStats = async () => {
  try {
    const res = await getSiteStats();
    if (setting.successCode.includes(res.code) && res.data) {
      siteStats.posts = res.data.posts ?? 0;
      siteStats.users = res.data.users ?? 0;
      siteStats.comments = res.data.comments ?? 0;
    }
  } catch (err) {
    console.warn("加载站点统计失败:", err);
  }
};
//分类选项
const currentSort = ref(null);
// 未选择排序时，界面默认高亮「更新」（请求仍传 null，不改变后端默认排序）
const effectiveSort = computed(() => currentSort.value ?? "update");
// 当前选中话题
const currentType = ref("");

// 当前话题标题
const currentTopicLabel = computed(() => {
  const topic = topics.value.find((t) => t.value === currentType.value);
  return topic ? topic.name : "最新";
});

// 点击话题筛选
const handleTopicClick = (type) => {
  if (currentType.value === type) return;
  currentType.value = type;
  searchParams.type = type;
  posts.currentPage = 1;
  posts.list = [];
  loadPosts();
};
//是否使用分页模式
const shouldShowPagination = computed(
  () => setting.showPagination && !posts.loading && posts.list.length > 0
);
//主视角定位，选择页面后可回到开头 分页模式使用
const mainView = ref(null);
// 是否还能加载更多（用于无限滚动）
const hasMore = computed(() => {
  return posts.list.length < posts.total;
});
// ========== 处理全局搜索 ==========
const searchParams = reactive({
  keyword: "", // 实际传给后端的值（分类搜索会转成英文）
  rawKeyword: "", // 用户原始输入（写进 URL、用于和路由比对）
  searchType: "",
  type: "",
});

// 分类搜索：用户输入的是中文标签，后端存的是存储值，这里做一次转换
// 原来是一张写死的 MAP，现在交给话题字典按名字查，新建的话题也能直接搜
const resolveCategoryValue = (rawKeyword) => topicStore.valueOfName(rawKeyword);

// 把搜索条件写进 URL
// 目的：刷新/前进后退能还原搜索态，也让人能一眼看出「当前不是首页原始列表」
const writeSearchQuery = (keyword, type) => {
  const query = {};
  if (keyword) {
    query.keyword = keyword;
    if (type) query.type = type;
  }
  if (
    String(route.query.keyword || "") === String(query.keyword || "") &&
    String(route.query.type || "") === String(query.type || "")
  ) {
    return; // location 没变化，避免触发无谓的路由跳转
  }
  router.replace({ path: "/", query }).catch(() => {});
};

// 回到「全部帖子」的干净状态（点 logo / 首页 / 清空搜索都走这里）
const resetSearch = () => {
  searchParams.keyword = "";
  searchParams.rawKeyword = "";
  searchParams.searchType = "";
  searchParams.type = "";
  currentType.value = ""; // 话题筛选也一并清掉

  posts.currentPage = 1;
  posts.list = [];
  posts.total = 0;

  writeSearchQuery("", "");
  loadPosts();
  window.scrollTo({ top: 0, behavior: "auto" });
};

// 搜索触发函数
const handleGlobalSearch = ({ keyword, type } = {}) => {
  const rawKeyword = String(keyword ?? "").trim();

  // 空关键词 = 撤销搜索，回到全部
  if (!rawKeyword) {
    resetSearch();
    return;
  }

  // 更新搜索参数
  searchParams.rawKeyword = rawKeyword;
  searchParams.keyword =
    type === "category"
      ? resolveCategoryValue(rawKeyword)
      : rawKeyword;
  searchParams.searchType = type || "";
  searchParams.type = "";
  currentType.value = ""; // 搜索时清掉话题筛选，保持状态一致

  // 重置分页状态
  posts.currentPage = 1;
  posts.list = [];
  posts.total = 0;

  writeSearchQuery(rawKeyword, type);

  // 重新加载（带搜索参数）
  loadPosts();
};

// 顶栏 / 移动端导航点「首页」「logo」时调用
const handleGoHome = () => {
  resetSearch();
};

// ========== 加载逻辑 ==========
const loadPosts = async (isLoadMore = false) => {
  if (isLoadMore) {
    if (posts.loading || !hasMore.value) return;
  }

  posts.loading = true;
  //下一页
  const targetPage = isLoadMore ? posts.currentPage + 1 : posts.currentPage;

  try {
    const res = await getPosts(
      targetPage,
      posts.pageSize,
      currentSort.value,
      searchParams.keyword,
      searchParams.searchType,
      searchParams.type
    );

    if (setting.successCode.includes(res.code)) {
      const newPosts = res.data.list || [];
      const newTotal = res.data.total || 0;
      if (isLoadMore) {
        posts.list.push(...newPosts);
        posts.currentPage += 1; // 已成功加载下一页
      } else {
        posts.list = newPosts;
        posts.total = newTotal;
        //posts.currentPage = 1; // 重置为第 1 页
      }
    }
  } catch (error) {
    console.error("加载失败:", error);
  } finally {
    posts.loading = false;
  }
};

// ========== 排序 ==========
const applySort = (option) => {
  currentSort.value = option.sortBy;
  posts.currentPage = 1;
  posts.list = []; // 清空避免闪现旧数据
  loadPosts(); // 重新加载第一页
};

// ========== 分页器 ==========
const handlePageChange = (page) => {
  posts.currentPage = page;
  loadPosts();
  nextTick(() => {
    mainView.value?.scrollIntoView({ behavior: "smooth" });
  });
};

// ========== Window 滚动监听（仅无限滚动模式） ==========
let ticking = false;
const onScroll = () => {
  if (!ticking && !setting.showPagination) {
    requestAnimationFrame(() => {
      const scrollTop = window.scrollY;
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = window.innerHeight;

      // 距离底部 < 200px 触发加载（比 100 更宽松，体验更好）
      if (scrollHeight - scrollTop - clientHeight < 200) {
        loadPosts(true); // isLoadMore = true
      }
      ticking = false;
    });
    ticking = true;
  }
};

// ========== 生命周期 ==========
onMounted(async () => {
  // 话题字典和帖子列表并行拉：不带关键词时两者互不依赖，首屏不受影响
  const topicsReady = topicStore.loadTopics();

  if (route.query.keyword) {
    // 分类搜索要把中文话题名转成存储值，必须等字典先就位
    await topicsReady;
    // 从他人主页带关键词跳回来时，直接沿用搜索条件
    handleGlobalSearch({
      keyword: String(route.query.keyword),
      type: route.query.type ? String(route.query.type) : "",
    });
  } else {
    // 首次加载（不分页模式还是无限滚动都走这里）
    loadPosts();
  }
  // 全站统计独立请求，只拉一次
  loadSiteStats();

  // 只有无限滚动模式才监听 window scroll
  if (!setting.showPagination) {
    window.addEventListener("scroll", onScroll);
  }
});

// 地址栏里的搜索条件变化时同步列表
// 覆盖三种场景：浏览器前进/后退、外站带 ?keyword= 进来、点 logo 把条件清空
watch(
  () => [String(route.query.keyword || ""), String(route.query.type || "")],
  ([keyword, type]) => {
    if (!keyword) {
      // URL 已无搜索条件，但页面还停在搜索结果上 → 回到全部
      if (searchParams.rawKeyword || searchParams.searchType) resetSearch();
      return;
    }
    if (
      keyword === searchParams.rawKeyword &&
      type === searchParams.searchType
    ) {
      return; // 自己刚写进去的，不用重复请求
    }
    handleGlobalSearch({ keyword, type });
  }
);


onBeforeUnmount(() => {
  window.removeEventListener("scroll", onScroll);
});

// ========== 事件处理 ==========
const handleLike = (postId) => {};
const handleComment = (postId) => {};
const handleReply = (postId, commentId) => {};
const handleEdit = (postId) => {};
const handleDelete = (postId) => {
  posts.list = posts.list.filter((p) => p.id !== postId);
  posts.total = Math.max(0, posts.total - 1);
};
</script>

<style scoped>
.kokomi-app {
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
  max-height: var(--header-banner-max-height);
  background-color: var(--header-banner-bg);
  background-position: center 0;
  background-size: cover;
  background-repeat: no-repeat;
  display: inline-block;
  user-select: none;
  overflow: visible;
}

.header-banner-picture {
  height: 100%;
  width: 100%;
  object-fit: cover;
  display: block;
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

.app-main {
  position: relative;
  display: grid;
  grid-template-columns: 200px minmax(0, 720px) 260px;
  justify-content: center;
  gap: 24px;
  padding: 20px 24px 0;
  height: 100%;
  transition: background-color 0.7s ease, color 0.7s ease;
}

/* 侧栏：整列吸顶，卡片本身不 sticky（否则多张卡片会粘到同一位置互相叠压） */
.sidebar {
  align-self: start;
  position: sticky;
  top: calc(var(--header-bar-height, 54px) + 16px);
  max-height: calc(100vh - var(--header-bar-height, 54px) - 32px);
  overflow-y: auto;
  overscroll-behavior: contain;
}

/* 侧栏卡片 */
.side-card {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
}

.side-card:last-child {
  margin-bottom: 0;
}

.side-card__title {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 12px;
}

/* 话题列表 */
.topic-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.topic-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
  color: var(--text-secondary);
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.topic-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.topic-item.is-active {
  background: var(--primary-color-soft);
  color: var(--primary-color);
  font-weight: 600;
}

.topic-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.topic-name {
  white-space: nowrap;
}

/* 右侧统计 */
.stat-grid {
  display: flex;
  gap: 12px;
}

.stat-item {
  flex: 1;
  text-align: center;
  background: var(--bg-secondary);
  border-radius: 10px;
  padding: 12px 0;
}

.stat-num {
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--primary-color);
}

.stat-label {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-top: 2px;
}

.about-text {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.7;
  color: var(--text-secondary);
}

/* 骨架屏 */
.post-skeleton {
  display: flex;
  gap: 14px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 12px;
}

.skeleton-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  flex-shrink: 0;
}

.skeleton-lines {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.skeleton-line {
  height: 14px;
  border-radius: 7px;
}

.post-skeleton .skeleton-avatar,
.post-skeleton .skeleton-line {
  background: linear-gradient(90deg, var(--bg-hover) 25%, var(--bg-secondary) 50%, var(--bg-hover) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}

@keyframes shimmer {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}

/* 加载动画 */
.spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid var(--border-color);
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  vertical-align: -3px;
  margin-right: 8px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 空状态 */
.empty-state {
  text-align: center;
  padding: 60px 20px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
}

.empty-state__icon {
  font-size: 2.6rem;
  margin-bottom: 10px;
}

.empty-state__title {
  margin: 0 0 6px;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.empty-state__desc {
  margin: 0 0 16px;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.empty-state__btn {
  padding: 8px 20px;
  border: none;
  border-radius: 17px;
  background: var(--primary-color);
  color: #fff;
  font-size: 0.9rem;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.empty-state__btn:hover {
  background: var(--primary-color-hover);
}

.main-content {
  position: relative;
  flex: 8;
  height: 100%;
  max-width: 800px;
  /* 不要给 min-height: 100vh：主内容区是从横幅下方开始的，
     撑满一屏会在最后一个帖子下面多出近一整屏的空白，滚到底还在往下滑 */
}

.sort-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: var(--bg-primary);
  font-size: 0.9rem;
  border-radius: 12px;
  padding: 10px 16px;
  margin-bottom: 12px;
  border: 1px solid var(--border-color);
  transition:
    background-color 0.7s ease,
    border-color 0.2s ease;
}

.sort-bar__left {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}

.sort-heading {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--text-primary);
  white-space: nowrap;
}

/* 标题前的一小段主题色竖条，给列表一个视觉起点 */
.sort-heading::before {
  content: "";
  display: inline-block;
  width: 3px;
  height: 13px;
  margin-right: 8px;
  border-radius: 2px;
  background: var(--primary-color);
  vertical-align: -1px;
}

.sort-count {
  /* 大屏左侧栏已有「帖子」总数，这里不重复显示；中屏侧栏隐藏时才补上 */
  display: none;
  font-size: 0.75rem;
  color: var(--text-secondary);
  white-space: nowrap;
}

@media (max-width: 1199px) and (min-width: 768px) {
  .sort-count {
    display: inline;
  }
}

.sort-bar__right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.sort-label {
  font-size: 0.75rem;
  color: var(--text-secondary);
  white-space: nowrap;
}

/* 分段控件：浅灰底盘 + 选中项浮起 */
.sort-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border-radius: 10px;
  background: var(--bg-nomarl);
  transition: background-color 0.7s ease;
}

.sort-tab {
  appearance: none;
  -webkit-appearance: none;
  border: none;
  background: transparent;
  height: auto;
  padding: 5px 12px;
  border-radius: 7px;
  font-family: inherit;
  font-size: 0.8125rem;
  line-height: 1.3;
  color: var(--text-secondary);
  cursor: pointer;
  white-space: nowrap;
  transition:
    background-color 0.18s ease,
    color 0.18s ease,
    box-shadow 0.18s ease;
}

.sort-tab:hover {
  color: var(--text-primary);
}

.sort-tab.is-active {
  background: var(--bg-primary);
  color: var(--primary-color);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

/* 暗色下 --bg-primary 比底盘更深，选中项改用浅色浮起 */
:root.dark .sort-tab.is-active {
  background: rgba(255, 255, 255, 0.09);
  box-shadow: none;
}

.posts-content {
  min-width: 0;
}

.posts-pagination {
  padding: 12px;
}

.loading,
.no-more {
  text-align: center;
  padding: 16px;
  color: var(--text-secondary);
}

/* 到底提示：左右各一条细线，让「结束」这件事有明确落点 */
.no-more {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.8125rem;
}

.no-more::before,
.no-more::after {
  content: "";
  flex: 1;
  height: 1px;
  background: var(--border-color);
}

/* 页面底部收尾留白：原来是 300px 的空块，最后一个帖子之后还能滑很久，
   这里只留一点视觉呼吸空间，滚到底就是「已经到底啦」 */
.kokomi-footer {
  position: relative;
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 6px 10px;
  padding: 28px 16px 32px;
  font-size: 0.75rem;
  line-height: 1.6;
  color: var(--text-secondary);
}

/* 两组之间那一枚「·」只在桌面显示：手机上两组各占一行，中间的分隔点没意义 */
.kokomi-footer__meta,
.kokomi-footer__links {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.kokomi-footer a {
  color: var(--text-secondary);
  text-decoration: none;
  transition: color 0.15s ease;
}

.kokomi-footer a:hover {
  color: var(--primary-color);
}

.kokomi-footer__sep {
  opacity: 0.45;
}

@media (max-width: 767px) {
  .kokomi-footer {
    gap: 4px;
    padding: 20px 14px 26px;
  }

  /* 手机上竖排两行，避免「联系我们」被挤到单独一行 */
  .kokomi-footer__sep--gap {
    display: none;
  }

  .kokomi-footer__meta,
  .kokomi-footer__links {
    flex-basis: 100%;
    justify-content: center;
  }
}

/* 小屏 (<768px)：单栏全宽，卡片贴边 */
@media (max-width: 767px) {
  .header-banner {
    display: none !important;
  }
  .sidebar-left,
  .sidebar-right {
    display: none !important;
  }
  .app-main {
    margin-top: 50px !important;
    padding: 0;
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }
  .main-content {
    max-width: 100%;
  }
  .posts-content {
    padding: 0;
  }

  /* 小屏排序栏：贴边、压缩，隐藏辅助文字 */
  .sort-bar {
    padding: 8px 12px;
    gap: 8px;
    margin-bottom: 0;
    border-radius: 0;
    border-left: none;
    border-right: none;
  }
  .sort-heading {
    font-size: 0.9375rem;
  }
  .sort-label {
    display: none;
  }
  .sort-tab {
    padding: 5px 9px;
    font-size: 0.75rem;
  }
}

/* 中屏 (768px ~ 1199px)：单栏，左右侧栏都隐藏
   话题栏在这里是 sticky 的，单列布局下后面的帖子会盖到它上面，直接不显示 */
@media (max-width: 1199px) and (min-width: 768px) {
  .app-main {
    grid-template-columns: minmax(0, 720px);
  }
  .sidebar-left,
  .sidebar-right {
    display: none;
  }
  /* banner 的 --header-min-width 是 1000px（B站原版 PC 强制最小宽度），
     窄屏下会把整页撑出横向滚动条，这里放开 */
  .header-banner {
    min-width: 0;
  }
}
</style>
