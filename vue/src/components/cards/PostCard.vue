<template>
  <article class="post-card">
    <!-- 帖子头部 -->
    <header class="post-card__header">
      <Avatar
        class="post-card__avatar"
        :src="post.author.avatar"
        :alt="post.author.name"
        :size="48"
        :badge="post.author.badge"
      />

      <div class="post-card__author-info">
        <div class="post-card__author-name">
          <span :style="{ color: post.author.nameColor }">{{ post.author.name }}</span>
        </div>
        <div class="post-card__time">
          <span>{{ formatRelativeTime(post.createdAt) }}</span>
        </div>
      </div>

      <div class="post-card__ornament">
        <!-- <span>一个平平无奇的人</span> -->
      </div>

      <div class="post-card__more">
        <Dropdown
          v-model:visible="moreDropdownVisible"
          :trigger="triggerMode"
          menuClass="dropdown-menu--postCard-more"
          :offsetY="5"
          :showArrow="true"
          placement="bottom-end"
        >
          <template #trigger>
            <div class="post-card__more-trigger">
              <div class="post-card__more-icon">
                <IconMore style="width: 24px; height: 28px" />
              </div>
            </div>
          </template>
          <template #menu="{ close }">
            <div
              class="more-actions-item"
              v-for="action in moreActions"
              :key="action.key"
              @click="
                () => {
                  moreActionsHandle(action);
                  close();
                }
              "
            >
              {{ action.label }}
            </div>
          </template>
        </Dropdown>
      </div>
    </header>

    <!-- 帖子主体 -->
    <div class="post-card__body">
      <h3 v-if="post.title" class="post-card__title">{{ post.title }}</h3>
      <div class="post-card__content" v-html="sanitizeContent(post.content)"></div>

      <!-- 图片展示（如果 mediaUrls 存在） -->
      <div v-if="post.mediaUrls && post.mediaUrls.length" class="post-card__media">
        <el-image
          v-for="(url, index) in post.mediaUrls"
          :key="index"
          :src="url"
          :alt="`图片 ${index + 1}`"
          class="post-card__image"
          fit="cover"
          :lazy="true"
          :preview-src-list="post.mediaUrls"
          :initial-index="index"
          :preview-teleported="true"
          hide-on-click-modal
          :fallback="imagePlaceholder"
        >
          <template #loading>
            <div class="el-image-loading">
              <svg
                class="el-icon-loading"
                viewBox="0 0 1024 1024"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M988 548c-19.9 0-36-16.1-36-36 0-59.4-11.6-117-34.6-171.3a440.45 440.45 0 0 0-94.3-139.9 437.71 437.71 0 0 0-139.9-94.3C629 11.6 571.4 0 512 0c-59.4 0-117 11.6-171.3 34.6a440.45 440.45 0 0 0-139.9 94.3 437.71 437.71 0 0 0-94.3 139.9C11.6 395 0 452.6 0 512c0 59.4 11.6 117 34.6 171.3a440.45 440.45 0 0 0 94.3 139.9 437.71 437.71 0 0 0 139.9 94.3C395 1012.4 452.6 1024 512 1024c59.4 0 117-11.6 171.3-34.6a440.45 440.45 0 0 0 139.9-94.3 437.71 437.71 0 0 0 94.3-139.9C1012.4 629 1024 571.4 1024 512c0-19.9-16.1-36-36-36zm-232 180c-19.3 0-36.8-7.5-49.4-20.1a67.9 67.9 0 0 1-20.1-49.4c0-19.3 7.5-36.8 20.1-49.4a67.9 67.9 0 0 1 49.4-20.1c19.3 0 36.8 7.5 49.4 20.1a67.9 67.9 0 0 1 20.1 49.4c0 19.3-7.5 36.8-20.1 49.4a67.9 67.9 0 0 1-49.4 20.1zm-456 0c-19.3 0-36.8-7.5-49.4-20.1a67.9 67.9 0 0 1-20.1-49.4c0-19.3 7.5-36.8 20.1-49.4a67.9 67.9 0 0 1 49.4-20.1c19.3 0 36.8 7.5 49.4 20.1a67.9 67.9 0 0 1 20.1 49.4c0 19.3-7.5 36.8-20.1 49.4a67.9 67.9 0 0 1-49.4 20.1zm228-460c-19.3 0-36.8-7.5-49.4-20.1a67.9 67.9 0 0 1-20.1-49.4c0-19.3 7.5-36.8 20.1-49.4a67.9 67.9 0 0 1 49.4-20.1c19.3 0 36.8 7.5 49.4 20.1a67.9 67.9 0 0 1 20.1 49.4c0 19.3-7.5 36.8-20.1 49.4a67.9 67.9 0 0 1-49.4 20.1z"
                  fill="currentColor"
                ></path>
              </svg>
            </div>
          </template>
        </el-image>
      </div>
    </div>

    <!-- 元数据 & 操作 -->
    <footer class="post-card__footer">
      <div class="post-card__stats">
        <span class="post-card__stat">👁️ {{ formatNumber(post.views) }}</span>
        <span class="post-card__stat">👍 {{ formatNumber(post.likes) }}</span>
        <span class="post-card__stat">💬 {{ formatNumber(post.commentsCount) }}</span>
      </div>

      <div class="post-card__actions">
        <button
          class="post-card__action-btn"
          :class="{ 'post-card__action-btn--liked': post.likedByMe }"
          @click="toggleLike"
        >
          👍 {{ post.likedByMe ? "已赞" : "点赞" }}
        </button>
        <button class="post-card__action-btn" @click="focusCommentInput">💬 评论</button>
        <button class="post-card__action-btn">🔗 分享</button>
      </div>
    </footer>

    <!-- 评论区 -->
    <section class="post-card__comments">
      <!-- 评论输入框（仅登录用户） -->
      <div v-if="userStore.isLogin" class="post-card__comment-input-area">
        <textarea
          v-model="newComment"
          ref="commentInputRef"
          placeholder="写下你的想法..."
          class="post-card__comment-textarea"
        ></textarea>
        <button
          :disabled="!newComment.trim()"
          @click="submitComment"
          class="post-card__comment-submit"
        >
          发布
        </button>
      </div>

      <!-- 评论列表 -->
      <ul class="post-card__comment-list">
        <li v-for="comment in comments" :key="comment.id" class="post-card__comment-item">
          <img
            :src="comment.author.avatar || defaultAvatar"
            class="post-card__comment-avatar"
          />
          <div class="post-card__comment-body">
            <div class="post-card__comment-header">
              <span class="post-card__comment-author">{{ comment.author.name }}</span>
              <span class="post-card__comment-time">{{
                formatAbsoluteTime(comment.createdAt)
              }}</span>
              <button class="post-card__reply-btn" @click="toggleReplyInput(comment.id)">
                回复
              </button>
            </div>
            <p class="post-card__comment-text">{{ comment.content }}</p>

            <!-- 回复列表 -->
            <ul v-if="comment.replies?.length" class="post-card__reply-list">
              <li
                v-for="reply in comment.replies"
                :key="reply.id"
                class="post-card__reply-item"
              >
                <span class="post-card__reply-author">@{{ reply.author.name }}</span>
                <span>{{ reply.content }}</span>
                <span class="post-card__reply-time">{{
                  formatAbsoluteTime(reply.createdAt)
                }}</span>
              </li>
            </ul>

            <!-- 回复输入框 -->
            <div v-if="showReplyInputId === comment.id" class="post-card__reply-input">
              <input
                v-model="replyInputs[comment.id]"
                type="text"
                :placeholder="`回复 @${comment.author.name}`"
                @keyup.enter="submitReply(comment.id)"
                class="post-card__reply-text"
              />
              <button @click="submitReply(comment.id)">发送</button>
            </div>
          </div>
        </li>
      </ul>

      <!-- 加载更多（可选） -->
      <button
        v-if="hasMoreComments"
        class="post-card__load-more"
        @click="loadMoreComments"
      >
        加载更多评论
      </button>
    </section>
  </article>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useUserStore } from "@/stores/user";
import { useUIStore } from "@/stores/ui";
import DOMPurify from "dompurify"; // 防 XSS
import { usePermission } from "@/utils/usePermission";
import { ALL_ACTIONS } from "@/utils/postActions";
import { formatRelativeTime, formatAbsoluteTime } from "@/utils/time";
// Props
const props = defineProps({
  post: {
    type: Object,
    required: true,
    validator(value) {
      return value.id && value.author && value.content !== undefined;
    },
  },
});

// Emits
const emit = defineEmits(["like", "comment", "reply", "edit", "delete"]);

// Store
const userStore = useUserStore();

//ui
const ui = useUIStore();
const isLargeScreen = computed(() => ui.screenSize === "lg");
const triggerMode = computed(() => {
  return isLargeScreen.value ? "hover" : "click";
});

// Refs
const commentInputRef = ref(null);
const newComment = ref("");
const replyInputs = ref({});
const showReplyInputId = ref(null);
const moreDropdownVisible = ref(false);
// Constants
const defaultAvatar = new URL("@/assets/images/kokomi.jpg", import.meta.url).href;
const imagePlaceholder = new URL("@/assets/images/kokomi1.jpg", import.meta.url).href;
// Computed
const isAuthor = computed(() => {
  return userStore.user?.id === props.post.author.id;
});

const currentUser = computed(() => userStore.user);

// 是否是自己的帖子
const isOwnPost = computed(() => {
  return currentUser.value && props.post.author.id === currentUser.value.id;
});

// 动态过滤操作项
const moreActions = computed(() => {
  const { hasPermission } = usePermission();

  return ALL_ACTIONS.filter((action) => {
    const req = action.requiredPermission;
    if (typeof req === "function") {
      return req({ isOwnPost: isOwnPost.value, post: props.post });
    } else if (Array.isArray(req)) {
      return req.every((p) => hasPermission(p));
    } else if (typeof req === "string") {
      return hasPermission(req);
    } else {
      return true; // 无限制
    }
  });
});

// 处理点击
const moreActionsHandle = (action) => {
  // 临时 hack：把 emit 传给 handler（更优雅的方式是让 handler 返回 promise 或回调）
  const wrappedHandler = action.handler.toString();
  if (wrappedHandler.includes("emit")) {
    // 不推荐，建议重构 handler 为接收上下文
  }

  // 更好的方式：在 handler 内部调用 API，成功后再 emit
  // 这里我们简单调用，并手动处理 delete
  if (action.key === "delete") {
    import("element-plus").then(({ ElMessageBox }) => {
      ElMessageBox.confirm("确定删除这条帖子？", "提示", {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning",
      }).then(() => {
        emit("delete", props.post.id);
      });
    });
  } else {
    action.handler(props.post);
  }
};

const formatNumber = (num) => {
  if (num >= 1000) return (num / 1000).toFixed(1) + "k";
  return num;
};

const sanitizeContent = (html) => {
  return DOMPurify.sanitize(html);
};

const toggleLike = () => {
  emit("like", props.post.id);
};

const focusCommentInput = () => {
  if (userStore.isLogin && commentInputRef.value) {
    commentInputRef.value.focus();
  }
};

const submitComment = () => {
  if (!newComment.value.trim()) return;
  emit("comment", { postId: props.post.id, content: newComment.value });
  newComment.value = "";
};

const toggleReplyInput = (commentId) => {
  if (showReplyInputId.value === commentId) {
    showReplyInputId.value = null;
  } else {
    showReplyInputId.value = commentId;
    if (!replyInputs.value[commentId]) {
      replyInputs.value[commentId] = "";
    }
  }
};

const submitReply = (commentId) => {
  const content = replyInputs.value[commentId]?.trim();
  if (!content) return;
  emit("reply", { commentId, content });
  replyInputs.value[commentId] = "";
  showReplyInputId.value = null;
};

// Mock comments (实际应从 API 获取)
const comments = ref([
  {
    id: "c1",
    content: "写得真好！",
    author: { name: "李四", avatar: "" },
    createdAt: "2026-01-04T10:00:00Z",
    replies: [
      {
        id: "r1",
        content: "谢谢！",
        author: { name: "张三", avatar: "" },
        createdAt: "2026-01-04T10:05:00Z",
      },
    ],
  },
]);

const hasMoreComments = ref(false);
const loadMoreComments = () => {
  // 实际调用 API
};
</script>

<style scoped>
/* 使用 BEM 命名，scoped 避免污染 */
.post-card {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  transition: background-color 0.7s ease, color 0.7s ease;
}

.post-card__header {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
  position: relative;
}

.post-card__avatar {
  margin-right: 12px;
}

.post-card__author-info {
  flex: 1;
}

.post-card__author-name {
  display: inline-block;
  font-size: 1.2rem;
  font-weight: bold;
  color: var(--text-primary);
  cursor: pointer;
  transition: opacity 0.2s ease-in-out;
}

.post-card__author-name:hover {
  opacity: 0.8;
}

.post-card__time {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.post-card__ornament {
  height: 36px;
  /*   width: 36px; */
  margin-right: 30px;
}

.post-card__more {
  margin-right: 8px;
  padding: 4px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.post-card__more-trigger {
  cursor: pointer;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  width: 100%;
  white-space: nowrap;
  background-color: transparent;
}

.post-card__more-trigger:hover {
  background-color: var(--bg-hover);
}

.post-card__more-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.3;
}

.more-actions-item {
  color: var(--text-secondary);
  background-color: var(--bg-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  padding: 4px 16px;
  font-size: 0.875rem;
}

.more-actions-item:hover,
.more-actions-item:focus {
  color: var(--text-primary);
  background-color: var(--bg-secondary);
}

.danger-item {
  color: #ff4d4f !important;
}
.danger-item:hover {
  background-color: #fff2f2 !important;
}

.post-card__body {
  margin-bottom: 16px;
}

.post-card__title {
  font-size: 1.25rem;
  margin: 0 0 12px;
  color: var(--text-primary);
}

.post-card__content {
  line-height: 1.6;
  color: var(--text-primary);
  word-break: break-word;
}

.post-card__media {
  margin-top: 12px;

  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
  max-height: 400px;
  overflow: hidden;
}

.post-card__image {
  width: 100%;
  height: 120px; /* 固定预览高度（和之前一致） */
  border-radius: 8px;
  cursor: pointer;
  transition: transform 0.2s ease;
  /* 隐藏 el-image 自带的边框（可选，根据你的主题调整） */
  --el-image-border-color: transparent;
  --el-image-hover-border-color: transparent;
}

.post-card__image:hover {
  transform: scale(1.02);
}

.post-card__media:only-child .post-card__image {
  height: 200px;
  max-width: 100%;
}

/* 4张及以上图片，2x2 网格（和之前一致） */
.post-card__media:has(.post-card__image:nth-child(4)) {
  grid-template-columns: repeat(2, 1fr);
}

.post-card__media:has(.post-card__image:nth-child(4)) .post-card__image {
  height: 100px;
}

/* 可选：加载中占位的样式优化 */
.el-image-loading {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  background-color: var(--bg-hover);
  border-radius: 8px;
}

.el-icon-loading {
  animation: el-rotate 2s linear infinite;
  width: 24px;
  height: 24px;
}


.post-card__footer {
  border-top: 1px solid var(--border-color);
  padding-top: 12px;
}

.post-card__stats {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.post-card__actions {
  display: flex;
  gap: 12px;
}

.post-card__action-btn {
  flex: 1;
  padding: 6px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: white;
  cursor: pointer;
  font-size: 0.875rem;
}

.post-card__action-btn--liked {
  background: #e6f7ff;
  border-color: #1890ff;
  color: #1890ff;
}

.post-card__comments {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
}

.post-card__comment-input-area {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.post-card__comment-textarea {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  resize: none;
  height: 60px;
}

.post-card__comment-submit {
  padding: 8px 16px;
  background: var(--primary-color);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.post-card__comment-list {
  list-style: none;
  padding: 0;
}

.post-card__comment-item {
  display: flex;
  margin-bottom: 16px;
}

.post-card__comment-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  margin-right: 12px;
  object-fit: cover;
}

.post-card__comment-body {
  flex: 1;
}

.post-card__comment-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.post-card__comment-author {
  font-weight: bold;
}

.post-card__comment-time {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.post-card__reply-btn {
  font-size: 0.8rem;
  color: var(--primary-color);
  background: none;
  border: none;
  cursor: pointer;
}

.post-card__reply-list {
  margin-top: 8px;
  padding-left: 20px;
  list-style: none;
}

.post-card__reply-item {
  margin-bottom: 6px;
  font-size: 0.9rem;
}

.post-card__reply-author {
  color: var(--primary-color);
  margin-right: 6px;
}

.post-card__reply-time {
  color: var(--text-secondary);
  font-size: 0.8rem;
  margin-left: 6px;
}

.post-card__reply-input {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.post-card__reply-text {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
}

@media (max-width: 768px) {
  .post-card__actions {
    flex-direction: column;
  }
}
</style>
<style>
.dropdown-menu--postCard-more {
  width: 100px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  box-shadow: 0 4px 12px var(--box-shadow);
  padding: 8px 0px;
  background-color: var(--bg-primary);
}
</style>
