<template>
  <div class="app">
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
      <aside class="sidebar-left">
        <!-- 导航、分类、快捷入口 -->
      </aside>
      <main class="main-content">
      <!-- 排序 -->
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

        <!-- 帖子 -->
        <div class="posts-content">
          <PostCard
            v-for="post in posts"
            :post="post"
            @like="handleLike"
            @comment="handleComment"
            @reply="handleReply"
            @edit="handleEdit"
            @delete="handleDelete"
          />
        </div>
      </main>
      <aside class="sidebar-right">
        <!-- 热门帖子、广告、在线用户等（桌面端显示） -->
      </aside>
    </div>

    <BottomNavbar />
    <LoginModal />
  </div>
</template>

<script setup>
import { ElMessage } from "element-plus";
import { Search } from "@element-plus/icons-vue";
import TopNavbar from "@/components/navbar/TopNavbar.vue";
import { useUserStore } from "@/stores/user";
import LoginModal from "@/components/modules/LoginModal.vue";
import { ref, reactive, watch } from "vue";
import MobileNavbar from "@/components/navbar/MobileNavbar.vue";
import BottomNavbar from "@/components/navbar/BottomNavbar.vue";
import PostCard from "@/components/cards/PostCard.vue";
const userStore = useUserStore();

watch(
  () => userStore.isLogin,
  (newVal) => {
    if (newVal) {
      // 登录成功后
    }
  }
);

const sortOptions = reactive([
  { label: "更新", sortBy: "update" },
  { label: "浏览", sortBy: "views" },
  { label: "点赞", sortBy: "likes" },
  { label: "评论", sortBy: "comments" },
]);

const currentSort = ref(null);

const applySort = (option) => {
  currentSort.value = option.sortBy;
  console.log(`Sorting by ${option.sortBy}`);
};

const post = {
  id: "1",
  title: "今天去爬山了",
  content: "<p>云海太美了！</p>",
  mediaUrls: [new URL('@/assets/images/kokomi001.jpg', import.meta.url).href,new URL('@/assets/images/kokomi002.jpg', import.meta.url).href],
  author: { id: "u1", name: "张三", avatar: "..." , isVip:true},
  createdAt: "2026-01-05T10:00:00Z",
  views: 1200,
  likes: 89,
  commentsCount: 24,
  likedByMe: false,
};

const posts = [
  post,
  post,
  post,
];

const handleLike = (postId) => {};
</script>

<style scoped>
.app {
  width: 100%;
  height: 100%;
}

.header-banner {
  position: relative;
  z-index: 0;
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
  height: 1024px;
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
  z-index: 2;
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

.posts-content{
  padding: 10px 20px;

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
