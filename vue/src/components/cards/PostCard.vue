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

      <!-- 图片展示 -->
      <div
        v-if="post.mediaUrls && post.mediaUrls.length"
        class="post-card__media"
        :class="imageLayout"
      >
        <PostImage
          v-for="(thumbUrl, index) in post.mediaUrls"
          :key="index"
          :src="thumbUrl"
          :preview-list="post.mediaUrls"
          :index="index"
          :width="imgWidth"
          :height="imgHeight"
        />
      </div>
    </div>

    <!-- 元数据 & 操作 -->
    <footer class="post-card__footer">
      <div class="post-card__stats">
        <div class="post-card__stat">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            xmlns:xlink="http://www.w3.org/1999/xlink"
            viewBox="0 0 18 18"
            width="18"
            height="18"
            style="width: 18px; height: 18px"
          >
            <path
              d="M9.789075 2.2956175C8.97235 1.6308450000000003 7.74999 2.212005 7.74999 3.26506L7.74999 5.3915500000000005C6.642015000000001 5.5780325 5.3073725 6.040405 4.141735000000001 7.11143C2.809155 8.335825 1.751515 10.3041 1.45716 13.404099999999998C1.409905 13.9018 1.7595399999999999 14.22505 2.105415 14.317499999999999C2.442215 14.40755 2.8807175 14.314625 3.127745 13.92915C3.9664525 12.620249999999999 4.89282 11.894575 5.765827499999999 11.50585C6.4628049999999995 11.19545 7.14528 11.093125 7.74999 11.0959L7.74999 13.235025C7.74999 14.2881 8.97235 14.869250000000001 9.789075 14.2045L15.556199999999999 9.510425000000001C16.355075 8.860149999999999 16.355075 7.640124999999999 15.556199999999999 6.989840000000001L9.789075 2.2956175zM9.165099999999999 3.0768275000000003L14.895025 7.739050000000001C15.227975 7.980475 15.235775 8.468875 14.943874999999998 8.7142L9.17615 13.416800000000002C8.979474999999999 13.562024999999998 8.75 13.4269 8.75 13.227375000000002L8.75 10.638175C8.75 10.326975000000001 8.542125 10.134725 8.2544 10.1118C7.186765 10.02955 6.1563175 10.2037 5.150895 10.69295C4.14982 11.186925 3.2102250000000003 12.096525 2.573625 13.00995C2.54981 13.046975 2.52013 13.046025 2.5211725 12.986C2.8971525 10.0573 3.9373475 8.652125 4.807025 7.85305C5.87747 6.8694775 7.213197500000001 6.444867500000001 8.2272 6.33056C8.606525 6.287802500000001 8.74805 6.0849325 8.74805 5.7032275L8.74805 3.2615475C8.74805 3.0764875000000007 8.993175 2.9321925 9.165099999999999 3.0768275000000003z"
              fill="currentColor"
            ></path>
          </svg>
          {{ formatNumber(post.views) }}
        </div>
        <span class="post-card__stat"
          ><svg
            xmlns="http://www.w3.org/2000/svg"
            xmlns:xlink="http://www.w3.org/1999/xlink"
            viewBox="0 0 18 18"
            width="18"
            height="18"
            style="width: 18px; height: 18px"
          >
            <path
              d="M1.5625 7.875C1.5625 4.595807499999999 4.220807499999999 1.9375 7.5 1.9375L10.5 1.9375C13.779175 1.9375 16.4375 4.595807499999999 16.4375 7.875C16.4375 11.0504 13.944675 13.6435 10.809275 13.80405C10.097025 14.722974999999998 8.920875 15.880675 7.267095 16.331325C6.9735075 16.4113 6.704762499999999 16.286224999999998 6.55411 16.092325C6.40789 15.904149999999998 6.3561 15.634350000000001 6.4652449999999995 15.383025C6.72879 14.776249999999997 6.776465 14.221025000000001 6.7340175 13.761800000000001C3.8167675 13.387125 1.5625 10.894475 1.5625 7.875zM7.5 2.9375C4.773095 2.9375 2.5625 5.148095 2.5625 7.875C2.5625 10.502575 4.61524 12.651075000000002 7.2041924999999996 12.8038C7.4305875 12.817174999999999 7.619625000000001 12.981200000000001 7.664724999999999 13.203475C7.772575 13.734575000000001 7.8012 14.405425000000001 7.5884275 15.148399999999999C8.748325 14.6682 9.606 13.759825 10.151275 13.016475C10.24445 12.889475 10.392050000000001 12.8138 10.54955 12.812275C13.253575 12.785725 15.4375 10.58535 15.4375 7.875C15.4375 5.148095 13.226899999999999 2.9375 10.5 2.9375L7.5 2.9375z"
              fill="currentColor"
            ></path>
          </svg>
          {{ formatNumber(post.likes) }}</span
        >
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

const imageLayout = computed(() => {
  const len = props.post.mediaUrls?.length || 0;
  if (len === 1) return "single"; // 1张图：单图布局
  if (len === 2 || len === 4) return "grid2"; // 2/4张图：每行2张（四宫格）
  if (len >= 3) return "grid3"; // 3张/≥5张：每行3张
  return "";
});

const imgHeight = computed(() => imgWidth.value);

const imgWidth = computed(() => {
  switch (imageLayout.value) {
    case "single":
      return 280; // 单图放大
    case "grid2":
      return 120; // 2/4张图四宫格
    case "grid3":
      return 100; // 3张/≥5张图三列
    default:
      return 100;
  }
});

// 限制最大显示9张图（超出滚动，主流平台通用）
const displayThumbnails = computed(() => {
  return props.post.mediaUrls?.slice(0, 9) || [];
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
  display: grid;
  gap: 8px;
  width: fit-content;
  overflow: hidden;
}

.post-card__media.single {
  grid-template-columns: 1fr;
}

/* 双列布局：grid2 - 2/4张图用，每行2张，四宫格，固定小尺寸 */
.post-card__media.grid2 {
  grid-template-columns: repeat(2, 120px); /* 固定2列，每列120px */
}

/* 三列布局：grid3 - 3张/≥5张图用，每行3张，固定更小尺寸，靠左换行 */
.post-card__media.grid3 {
  grid-template-columns: repeat(3, 100px);
  max-height: calc(100px * 3 + 8px * 2);
  overflow-y: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

/* 隐藏Chrome/Safari滚动条 */
.post-card__media.grid3::-webkit-scrollbar {
  display: none;
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

.post-card__stat {
  display: flex;
  gap: 2px;
  align-items: center;
  justify-content: center;
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
