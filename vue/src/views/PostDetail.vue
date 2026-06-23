<template>
  <div class="post-detail-page">
    <!-- 顶部导航 -->
    <TopNavbar @search="handleGlobalSearch" />
    <MobileNavbar @search="handleGlobalSearch" />

    <div class="header-banner">
      <img class="banner-img" src="@/assets/images/bgbili.png" alt="banner" />
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
        <PostCard :post="post" :show-comments="false" />
        <div class="post-detail-comments">
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
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getPostById } from '@/api/posts'
import TopNavbar from '@/components/navbar/TopNavbar.vue'
import PostCard from '@/components/posts/PostCard.vue'
import PostComment from '@/components/posts/PostComment.vue'

const route = useRoute()
const router = useRouter()

const post = ref(null)
const loading = ref(true)

const goBack = () => {
  router.back()
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
  margin-top: 0;
  background: var(--bg-primary);
  border-radius: 4px;
  border: 1px solid var(--border-color);
  padding: 0 20px 16px;
}
</style>
