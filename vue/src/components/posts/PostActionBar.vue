<template>
  <aside class="post-action-bar" aria-label="帖子操作">
    <!-- 点赞 -->
    <button
      type="button"
      class="pab-item"
      :class="{ 'is-active': post.likedByMe }"
      :aria-pressed="!!post.likedByMe"
      @click="handleLike"
    >
      <IconLike :size="22" />
      <span class="pab-item__label">{{ likeCount > 0 ? formatNumber(likeCount) : "点赞" }}</span>
    </button>

    <!-- 评论：滚动到评论区 -->
    <button type="button" class="pab-item" @click="emit('comment-click')">
      <IconComment :size="22" />
      <span class="pab-item__label">{{ commentCount > 0 ? formatNumber(commentCount) : "评论" }}</span>
    </button>

    <!-- 转发 -->
    <button type="button" class="pab-item" @click="handleForward">
      <IconForward :size="22" />
      <span class="pab-item__label">{{ forwardCount > 0 ? formatNumber(forwardCount) : "转发" }}</span>
    </button>

    <!-- 分享：直接复制帖子链接 -->
    <button type="button" class="pab-item" @click="copyPostLink(post)">
      <IconShare :size="22" />
      <span class="pab-item__label">分享</span>
    </button>
  </aside>
</template>

<script setup>
import { computed, ref } from "vue";
import IconLike from "@/components/icons/IconLike.vue";
import IconComment from "@/components/icons/IconComment.vue";
import IconForward from "@/components/icons/IconForward.vue";
import IconShare from "@/components/icons/IconShare.vue";
import { likePost, unlikePost } from "@/api/posts";
import { confirmAndForward } from "@/utils/postForward";
import { copyPostLink } from "@/utils/sharePost";
import message from "@/utils/message";
import { useUserStore } from "@/stores/user";
import { useUIStore } from "@/stores/ui";

const props = defineProps({
  post: { type: Object, required: true },
});

const emit = defineEmits(["comment-click"]);

const userStore = useUserStore();
const ui = useUIStore();

const liking = ref(false);

const likeCount = computed(() => {
  const n = Number(props.post?.likes ?? props.post?.likeCount ?? 0);
  return Number.isFinite(n) ? n : 0;
});

const commentCount = computed(() => {
  const p = props.post || {};
  const n = Number(p.commentsCount ?? p.comments ?? p.commentCount ?? 0);
  return Number.isFinite(n) ? n : 0;
});

const forwardCount = computed(() => {
  const p = props.post || {};
  const n = Number(p.forward ?? p.forwardCount ?? p.forwardsCount ?? 0);
  return Number.isFinite(n) ? n : 0;
});

const formatNumber = (num) => {
  if (num >= 1000) return (num / 1000).toFixed(1) + "k";
  return num;
};

async function handleLike() {
  if (!props.post?.id || liking.value) return;
  if (!userStore.isLogin) {
    message.warning("登录后才能点赞");
    ui.openLoginModal();
    return;
  }
  liking.value = true;
  const post = props.post;
  try {
    if (post.likedByMe) {
      await unlikePost(post.id);
      post.likedByMe = false;
      post.likes = Math.max(0, Number(post.likes || 0) - 1);
    } else {
      await likePost(post.id);
      post.likedByMe = true;
      post.likes = Number(post.likes || 0) + 1;
    }
  } catch {
    // 错误提示已由 request 拦截器统一处理
  } finally {
    liking.value = false;
  }
}

function handleForward() {
  confirmAndForward(props.post);
}
</script>

<style scoped>
/* 竖排悬浮操作条：只在 ≥1200px 显示。
   详情页容器固定 720px 居中，所以 left 用「屏幕中线 + 半个容器宽 + 间距」定位。 */
.post-action-bar {
  position: fixed;
  top: 50%;
  left: calc(50% + 380px);
  transform: translateY(-50%);
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pab-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: 52px;
  height: 52px;
  padding: 0;
  border: 1px solid var(--border-color);
  border-radius: 50%;
  background: var(--bg-primary);
  color: var(--text-secondary);
  cursor: pointer;
  box-shadow: 0 2px 8px var(--box-shadow);
  transition: color 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
}

.pab-item:hover {
  color: var(--primary-color);
  border-color: var(--primary-color);
  transform: translateY(-1px);
}

.pab-item.is-active {
  color: var(--primary-color);
  border-color: var(--primary-color);
}

.pab-item__label {
  font-size: 0.625rem;
  line-height: 1;
  color: inherit;
  max-width: 44px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 屏宽不够放（1200px 以下会压到内容区）就整体隐藏 */
@media (max-width: 1199px) {
  .post-action-bar {
    display: none;
  }
}
</style>
