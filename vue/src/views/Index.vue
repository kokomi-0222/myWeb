<template>
  <div class="kokomi-app">
    <TopNavbar />
    <MobileNavbar />
    <div class="header-banner">
      <img
        src="@/assets/images/bgTop.jpg"
        style="height: 100%; width: 100%; object-fit: cover; display: block"
      />
      <div class="header-banner-overlay"></div>
    </div>
    <div class="app-main">
      <aside class="sidebar-left"></aside>
      <main class="main-content">
        <div class="sort-bar">
          <div class="sort-title">排序</div>
          <ul class="sort-content">
            <li
              v-for="(option, index) in sortOptions"
              :key="index"
              :class="{ active: currentSort === option.sortBy }"
            >
              <a href="#" @click.prevent="applySort(option)">
                <span>{{ option.label }}</span>
              </a>
            </li>
          </ul>
        </div>

        <div class="posts-content">
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
          <div v-if="posts.list.length === 0 && !posts.loading" class="no-data">
            暂无帖子
          </div>
        </div>

        <!-- 分页器（仅分页模式） -->
        <div v-if="setting.showPagination" class="posts-pagination">
          <Pagination
            :totalItems="posts.total"
            :pageSize="posts.pageSize"
            v-model="posts.pageNum"
            @change="handlePageChange"
          />
        </div>
      </main>
      <aside class="sidebar-right"></aside>
    </div>
    <div class="kokomi-footer"></div>
    <BottomNavbar />
    <LoginModal />
  </div>
</template>

<script setup>
import TopNavbar from "@/components/navbar/TopNavbar.vue";
import MobileNavbar from "@/components/navbar/MobileNavbar.vue";
import BottomNavbar from "@/components/navbar/BottomNavbar.vue";
import PostCard from "@/components/cards/PostCard.vue";
import LoginModal from "@/components/modules/LoginModal.vue";
import { getPosts } from "@/api/posts";
import setting from "@/config/setting";

import { ref, reactive, computed, onMounted, onBeforeUnmount, watch } from "vue";

// ========== 状态 ==========
const sortOptions = [
  { label: "更新", sortBy: "update" },
  { label: "浏览", sortBy: "views" },
  { label: "点赞", sortBy: "likes" },
  { label: "评论", sortBy: "comments" },
];

const currentSort = ref(null);

const posts = reactive({
  list: [],
  total: 0,
  pageNum: 1,
  pageSize: setting.postsPageSize || 10,
  loading: false,
});

// 是否还能加载更多（用于无限滚动）
const hasMore = computed(() => {
  return posts.list.length < posts.total;
});

// ========== 加载逻辑 ==========
const loadPosts = async (isLoadMore = false) => {
  //  关键：只有“加载更多”才检查 hasMore 和 loading
  if (isLoadMore) {
    if (posts.loading || !hasMore.value) return;
  }

  posts.loading = true;

  try {
    const res = await getPosts(posts.pageNum, posts.pageSize, currentSort.value);

    if (setting.successCode.includes(res.code)) {
      const newPosts = res.data.list || [];
      const newTotal = res.data.total || 0;

      if (isLoadMore) {
        // 无限滚动：追加
        posts.list.push(...newPosts);
        posts.pageNum += 1;
      } else {
        // 首次 or 分页切换 or 排序：覆盖
        posts.list = newPosts;
        posts.total = newTotal;
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
  posts.pageNum = 1;
  posts.list = []; // 清空避免闪现旧数据
  loadPosts(); // 重新加载第一页
};

// ========== 分页器 ==========
const handlePageChange = (page) => {
  posts.pageNum = page;
  loadPosts();
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
onMounted(() => {
  // 首次加载（不分页模式还是无限滚动都走这里）
  loadPosts();

  // 只有无限滚动模式才监听 window scroll
  if (!setting.showPagination) {
    window.addEventListener("scroll", onScroll);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("scroll", onScroll);
});

// ========== 事件处理 ==========
const handleLike = (postId) => {};
const handleComment = (postId) => {};
const handleReply = (postId, commentId) => {};
const handleEdit = (postId) => {};
const handleDelete = (postId) => {};
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
  display: flex;
  margin-top: -100px;
  height: 100%;
  padding: 0 16px;
}

.sidebar-left {
  flex: 1;
  height: 100%;
}

.sidebar-right {
  flex: 1;
  height: 100%;
}

.main-content {
  position: relative;
  flex: 8;
  height: 100%;
  background-color: var(--bg-secondary);
  box-shadow: 0px -2px 6px rgba(0, 0, 0, 0.3);
}

.sort-bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 10px;
  font-size: 14px;
}

.sort-title {
  padding-right: 5px;
}

.sort-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-left: 10px;
  gap: 10px;
  margin-right: 10px;
  border-left: 1px solid var(--border-color);
}

.sort-content a {
  text-decoration: none;
  opacity: 0.5;
  color: var(--text-primary);
}

.sort-content .active a,
.sort-content a:hover {
  opacity: 1;
  color: var(--primary-color);
}

.sort-content li {
  list-style: none;
}

.posts-content {
  padding: 10px 20px;
}

.posts-pagination {
  padding: 12px;
}

.loading,
.no-more,
.no-data {
  text-align: center;
  padding: 16px;
  color: #888;
}

.kokomi-footer {
  position: relative;
  width: 100%;
  height: 300px;
}

/* 小屏 (<768px) */
@media (max-width: 767px) {
  .header-banner {
    display: none !important;
  }
  .sidebar-left,
  .sidebar-right {
    display: none !important;
  }
  .app-main {
    margin-top: 0 !important; /* 移动端不需要上移 */
    padding: 0;
  }
}

/* 中屏 (768px ~ 1023px) */
@media (min-width: 768px) and (max-width: 1023px) {
}
</style>
