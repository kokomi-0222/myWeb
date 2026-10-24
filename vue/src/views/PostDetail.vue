<template>
  <div class="post-detail-page">
    <!-- 顶部导航 -->
    <TopNavbar @search="handleGlobalSearch" />
    <MobileNavbar @search="handleGlobalSearch" />

    <div class="header-banner">
      <Banner />
    </div>
    <div class="post-detail-container">
      <!-- 返回按钮 -->
      <!-- <div class="post-detail-back">
        <button class="back-btn" @click="goBack">&larr; 返回</button>
      </div> -->

      <!-- 加载中 -->
      <div v-if="loading" class="post-detail-loading">
        <span>加载中...</span>
      </div>

      <!-- 帖子不存在 -->
      <div v-else-if="!post" class="post-detail-empty">
        <span>帖子不存在</span>
      </div>

      <!-- 帖子内容 + 评论区 -->
      <template v-else>
        <!-- 右侧竖排悬浮操作条（≥1200px 显示） -->
        <PostActionBar :post="post" @comment-click="scrollToComments" />
        <PostCard :post="post" :show-comments="false" :clickable="false" :collapsible="false" />
        <div ref="commentsRef" class="post-detail-comments">
          <PostComment
            :post-id="post.id"
            :post-author-id="post.author.id"
            :comments-count="post.commentsCount ?? post.comments ?? 0"
            mode="full"
            @comment="handleComment"
          />
        </div>
      </template>
    </div>

    <!-- 详情页也要挂登录弹窗：未登录点赞/转发/评论时会调用 openLoginModal，
         以前这个页面没挂，点了没反应 -->
    <LoginModal />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getPostById } from '@/api/posts'
import TopNavbar from '@/components/navbar/TopNavbar.vue'
import Banner from '@/components/modules/Banner.vue'
import PostCard from '@/components/posts/PostCard.vue'
import PostActionBar from '@/components/posts/PostActionBar.vue'
import PostComment from '@/components/posts/PostComment.vue'
import LoginModal from '@/components/modules/LoginModal.vue'

/*
 * 横幅：与首页完全同源 —— 同一个 Banner.vue、同一套 assets/images/banner/layer01..32.png，
 * 参数一律用组件默认值（160px 高、maxTranslate 300、32 层视差系数）。
 * 好处是两页视觉与手感完全一致，改首页横幅时详情页自动跟着变，不用维护第二份。
 *
 * 另外两个组件保留着，只是这里不用：
 *   - DetailBanner.vue      10 层版视差引擎（容器归一化 + rAF lerp），配 banner-detail/ 素材
 *   - DetailBannerAurora.vue 纯 CSS 极光渐变，零素材
 */

const route = useRoute()
const router = useRouter()

const post = ref(null)
const loading = ref(true)
const commentsRef = ref(null)

const goBack = () => {
  router.back()
}

// 右侧操作条「评论」按钮：滚到评论区
const scrollToComments = () => {
  commentsRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const handleComment = () => {
  if (post.value) {
    const current = Number(post.value.commentsCount ?? post.value.comments ?? 0)
    post.value.commentsCount = current + 1
  }
}

onMounted(async () => {
  const id = route.params.id
  if (!id) {
    loading.value = false
    return
  }
  try {
    const res = await getPostById(id)
    post.value = res?.data
  } catch (e) {
    console.error('加载帖子失败', e)
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.post-detail-page {
  min-height: 100vh;
  background: var(--bg-secondary);
}


.header-banner {
  position: relative;
  justify-content: center;
  margin: 0 auto;
  width: 100%;
  min-width: 0;
  height: var(--header-banner-height);
  /*   max-height: var(--header-banner-max-height); */
  background-color: var(--header-banner-bg);
  background-position: center 0;
  background-size: cover;
  background-repeat: no-repeat;
  display: block;
  user-select: none;
  overflow: hidden;
}

/* 与首页 Banner 同源，底色与叠层都由组件自己管，这里只负责定高和裁切。
   display 用 block 而不是首页的 inline-block：inline-block 会留 5px 行盒间隙，
   内容区顶部会露出一条浅色缝。 */

.post-detail-container {
  max-width: 720px;
  margin: 0 auto;
  padding: 16px 20px;
}

.post-detail-back {
  margin-bottom: 12px;
}

.back-btn {
  padding: 6px 16px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.875rem;
}

.back-btn:hover {
  color: var(--primary-color);
  border-color: var(--primary-color);
}

.post-detail-loading,
.post-detail-empty {
  text-align: center;
  padding: 60px 0;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.post-detail-comments {
  margin-top: 14px;
  background: var(--bg-primary);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  padding: 0 20px 16px;
  /* 右侧操作条点「评论」滚动到这里时，别被固定顶栏盖住 */
  scroll-margin-top: calc(var(--header-bar-height) + 12px);
}

/* 移动端：与首页保持一致——隐藏 banner，容器贴边 */
@media (max-width: 767px) {
  .header-banner {
    display: none;
  }

  .post-detail-container {
    /* 横幅在移动端隐藏后，必须手动让出固定顶栏的高度，
       否则帖子卡片会钻到顶栏底下（作者头像和昵称被切掉） */
    padding: calc(var(--header-bar-height) + 6px) 0 0;
    max-width: 100%;
  }

  .post-detail-comments {
    border-radius: 0;
    border-left: none;
    border-right: none;
    padding: 0 16px 16px;
  }
}
</style>
