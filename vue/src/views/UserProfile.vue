<template>
  <div class="user-page">
    <TopNavbar @search="goSearch" />
    <MobileNavbar @search="goSearch" />

    <!-- 横幅：与首页、详情页完全同源（同一个 Banner.vue + 同一套 32 层素材） -->
    <div class="header-banner">
      <Banner />
    </div>

    <div class="user-page__body">
      <!-- 用户信息卡 -->
      <section class="profile-card">
        <template v-if="loadingProfile && !profile">
          <div class="profile-card__skeleton">
            <div class="sk-avatar"></div>
            <div class="sk-lines">
              <div class="sk-line" style="width: 140px"></div>
              <div class="sk-line" style="width: 220px"></div>
            </div>
          </div>
        </template>

        <template v-else-if="profile">
          <Avatar
            class="profile-card__avatar"
            :src="profile.avatar"
            :alt="profile.name"
            :size="88"
            :badge="profile.badge"
          />
          <div class="profile-card__info">
            <div class="profile-card__name-row">
              <h1 class="profile-card__name" :style="{ color: profile.nameColor }">
                {{ profile.name || "未命名用户" }}
              </h1>
              <span
                v-if="shouldShowRoleTag(profile.primaryRole)"
                class="profile-card__role"
                :style="rolePillStyle(profile.roleColor)"
              >{{ roleLabelOf(profile.primaryRole) }}</span>
            </div>
            <p class="profile-card__signature">
              {{ profile.signature || "这个人很神秘，什么都没写~" }}
            </p>
            <div class="profile-card__meta">
              <span>{{ profile.postCount || 0 }} 篇帖子</span>
              <span class="dot">·</span>
              <span>加入于 {{ formatJoinDate(profile.createTime) }}</span>
            </div>
          </div>
        </template>

        <div v-else class="profile-card__empty">
          <p>用户不存在或已被注销</p>
          <Button type="bilibili" @click="router.push('/')">回到首页</Button>
        </div>
      </section>

      <!-- 帖子列表 -->
      <section v-if="profile" class="user-posts">
        <div class="user-posts__head">
          <h2 class="user-posts__title">TA 的帖子</h2>
          <span v-if="posts.total" class="user-posts__count">共 {{ posts.total }} 篇</span>
        </div>

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
          @delete="handleDelete"
        />

        <div v-if="!posts.loading && posts.list.length === 0" class="empty-state">
          <div class="empty-state__icon">🫧</div>
          <p class="empty-state__title">TA 还没有发过帖子</p>
          <p class="empty-state__desc">过段时间再来看看吧</p>
        </div>

        <div v-if="posts.total > posts.pageSize" class="user-posts__pagination">
          <Pagination
            :totalItems="posts.total"
            :pageSize="posts.pageSize"
            v-model="posts.currentPage"
            @change="handlePageChange"
          />
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, watch, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import Banner from "@/components/modules/Banner.vue";
import { getUserProfile } from "@/api/user";
import { getUserPosts } from "@/api/posts";
import setting from "@/config/setting";
import message from "@/utils/message";
import { roleLabelOf, shouldShowRoleTag, rolePillStyle } from "@/utils/roleTag";

const route = useRoute();
const router = useRouter();

const profile = ref(null);
const loadingProfile = ref(false);

const posts = reactive({
  list: [],
  total: 0,
  currentPage: 1,
  pageSize: 10,
  loading: false,
});

function formatJoinDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`;
}

async function loadProfile(id) {
  loadingProfile.value = true;
  profile.value = null;
  try {
    const res = await getUserProfile(id);
    if (setting.successCode.includes(res.code)) {
      profile.value = res.data;
    }
  } catch (err) {
    // 用户不存在时后端返回业务错误，request 层已弹过提示，这里保持空态
    console.warn("加载用户资料失败:", err);
  } finally {
    loadingProfile.value = false;
  }
}

async function loadPosts(id) {
  posts.loading = true;
  try {
    const res = await getUserPosts(
      posts.currentPage,
      posts.pageSize,
      null,
      "",
      "",
      id
    );
    if (setting.successCode.includes(res.code)) {
      posts.list = res.data?.list || [];
      posts.total = res.data?.total || 0;
    }
  } catch (err) {
    console.error("加载用户帖子失败:", err);
  } finally {
    posts.loading = false;
  }
}

function handlePageChange(page) {
  posts.currentPage = page;
  loadPosts(route.params.id);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function handleLike() {
  // 列表里的点赞状态由 PostCard 自己维护，这里只需重新拉一次保证数字准确
  loadPosts(route.params.id);
}

function handleComment() {
  // 评论数量变化后刷新列表，保持卡片上的计数一致
  loadPosts(route.params.id);
}

function handleDelete() {
  loadPosts(route.params.id);
  loadProfile(route.params.id);
}

// 顶栏/移动端搜索：回到首页并带上关键词
function goSearch({ keyword, type }) {
  router.push({ path: "/", query: { keyword, type } });
}

function reload(id) {
  posts.currentPage = 1;
  posts.list = [];
  posts.total = 0;
  if (!id) return;
  loadProfile(id);
  loadPosts(id);
}

onMounted(() => {
  const id = route.params.id;
  if (!id) {
    message.error("用户不存在");
    router.replace("/");
    return;
  }
  reload(id);
});

// 在同一个用户页内跳到另一个用户（比如从帖子作者跳转）时重新加载
watch(
  () => route.params.id,
  (id, oldId) => {
    if (id && id !== oldId) reload(id);
  }
);
</script>

<style scoped>
.user-page {
  min-height: 100vh;
  background: var(--bg-nomarl);
}

/* ---------- 横幅 ----------
   与首页、详情页完全同源，底色与叠层由 Banner.vue 自己管，
   这里只负责定高和裁切。 */
.header-banner {
  position: relative;
  margin: 0 auto;
  width: 100%;
  /* Banner 内有 --header-min-width: 1000px，视口更窄时会撑出横向滚动条 */
  min-width: 0;
  height: var(--header-banner-height);
  background-color: var(--header-banner-bg);
  background-position: center 0;
  background-size: cover;
  background-repeat: no-repeat;
  /* 用 block 而不是 inline-block，后者会留 5px 行盒间隙 */
  display: block;
  user-select: none;
  overflow: hidden;
}

.user-page__body {
  max-width: 720px;
  margin: 0 auto;
  padding: 20px 16px 48px;
}

/* ---------- 用户信息卡 ---------- */
.profile-card {
  display: flex;
  align-items: center;
  gap: 20px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 24px;
}

.profile-card__avatar {
  flex-shrink: 0;
}

.profile-card__info {
  min-width: 0;
  flex: 1;
}

.profile-card__name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.profile-card__name {
  margin: 0;
  font-size: 1.375rem;
  font-weight: 700;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.profile-card__role {
  flex-shrink: 0;
  font-size: 0.7rem;
  font-weight: 600;
  color: #fb7299;
  background: rgba(251, 114, 153, 0.12);
  padding: 1px 8px;
  border-radius: 9px;
}

.profile-card__signature {
  margin: 8px 0 10px;
  font-size: 0.875rem;
  line-height: 1.6;
  color: var(--text-secondary);
  overflow-wrap: break-word;
}

.profile-card__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8125rem;
  color: var(--text-secondary);
}

.profile-card__meta .dot {
  opacity: 0.5;
}

.profile-card__empty {
  width: 100%;
  text-align: center;
  padding: 24px 0;
  color: var(--text-secondary);
}

.profile-card__empty p {
  margin: 0 0 16px;
}

/* 骨架 */
.profile-card__skeleton {
  display: flex;
  align-items: center;
  gap: 20px;
  width: 100%;
}

.sk-avatar {
  width: 88px;
  height: 88px;
  border-radius: 50%;
  background: var(--bg-nomarl);
  flex-shrink: 0;
}

.sk-lines {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sk-line {
  height: 12px;
  border-radius: 6px;
  background: var(--bg-nomarl);
}

/* ---------- 帖子列表 ---------- */
.user-posts {
  margin-top: 16px;
}

.user-posts__head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 4px 4px 12px;
}

.user-posts__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  position: relative;
  padding-left: 10px;
}

.user-posts__title::before {
  content: "";
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 14px;
  border-radius: 2px;
  background: var(--primary-color);
}

.user-posts__count {
  font-size: 0.8125rem;
  color: var(--text-secondary);
}

.user-posts__pagination {
  display: flex;
  justify-content: center;
  padding: 20px 0 0;
}

/* 骨架与空状态沿用首页的样式语言 */
.post-skeleton {
  display: flex;
  gap: 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 20px 24px;
  margin-bottom: 12px;
}

.skeleton-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--bg-nomarl);
  flex-shrink: 0;
}

.skeleton-lines {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 4px;
}

.skeleton-line {
  height: 12px;
  border-radius: 6px;
  background: var(--bg-nomarl);
}

.empty-state {
  text-align: center;
  padding: 56px 20px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 14px;
}

.empty-state__icon {
  font-size: 2rem;
  margin-bottom: 10px;
}

.empty-state__title {
  margin: 0 0 6px;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-primary);
}

.empty-state__desc {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--text-secondary);
}

@media (max-width: 767px) {
  /* 与首页、详情页保持一致：移动端不显示横幅 */
  .header-banner {
    display: none;
  }

  .user-page__body {
    /* 横幅在移动端隐藏后，必须手动让出固定顶栏的高度，
       否则资料卡会钻到顶栏底下（头像顶部被切掉） */
    padding: calc(var(--header-bar-height) + 6px) 10px 32px;
  }

  .profile-card {
    flex-direction: column;
    text-align: center;
    padding: 20px 16px;
  }

  .profile-card__name-row,
  .profile-card__meta {
    justify-content: center;
  }

  .profile-card__name {
    font-size: 1.125rem;
  }
}
</style>
