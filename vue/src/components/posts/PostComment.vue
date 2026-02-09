<template>
  <div class="comment-section">
    <div class="comment-section-header">
      <div class="comment-title">
        <span class="comment-title-text">评论</span>
        <span class="comment-title-count"> {{ comments.length }}</span>
      </div>
      <div class="comment-sort">
        <div
          class="comment-sort-item"
          v-for="(option, index) in sortOptions"
          :key="index"
          @click="handleSort(option.sortBy)"
        >
          <span
            class="comment-sort-label"
            :class="{ active: currentSort === option.sortBy }"
            >{{ option.label }}</span
          >
          <div class="comment-sort-divider" v-if="index != sortOptions.length - 1"></div>
        </div>
      </div>
    </div>
    <div class="comment-content">
      <div class="comment-input">
        <Avatar :src="userStore.user?.avatar" alt="" :size="40" />
        <div class="comment-input-area">
          <InputTextarea
            v-model="commentContent"
            placeholder="天青色等烟雨，而我在等你..."
            @submit="handleCommentSubmit"
            @image-upload="handleImageUpload"
          />

          <!--  <textarea
            v-model="newComment"
            ref="commentInputRef"
            placeholder="天青色等烟雨，而我在等你..."
            class="comment-textarea"
          ></textarea> -->
          <!-- <button
            :disabled="!newComment.trim()"
            @click="submitComment"
            class="comment-submit"
          >
            发布
          </button> -->
        </div>
      </div>

      <!-- <div v-else class="comment-login-tip">
        请先
        <span @click="ui.openLoginModal" style="color: #4173df; cursor: pointer"
          >登录</span
        >后发表评论
      </div> -->

      <!-- 评论列表 -->
      <ul class="comment-list">
        <li v-for="comment in comments" :key="comment.id" class="comment-item">
          <img :src="comment.author.avatar || defaultAvatar" class="comment-avatar" />
          <div class="comment-body">
            <div class="comment-header">
              <span class="comment-author">{{ comment.author.name }}</span>
              <span class="comment-time">{{
                formatAbsoluteTime(comment.createdAt)
              }}</span>
              <button class="reply-btn" @click="toggleReplyInput(comment.id)">
                回复
              </button>
            </div>
            <p class="comment-text">{{ comment.content }}</p>

            <!-- 回复列表 -->
            <ul v-if="comment.replies?.length" class="reply-list">
              <li v-for="reply in comment.replies" :key="reply.id" class="reply-item">
                <span class="reply-author">@{{ reply.author.name }}</span>
                <span>{{ reply.content }}</span>
                <span class="reply-time">{{ formatAbsoluteTime(reply.createdAt) }}</span>
              </li>
            </ul>

            <!-- 回复输入框 -->
            <div v-if="showReplyInputId === comment.id" class="reply-input">
              <input
                v-model="replyInputs[comment.id]"
                type="text"
                :placeholder="`回复 @${comment.author.name}`"
                @keyup.enter="submitReply(comment.id)"
                class="reply-text"
              />
              <button @click="submitReply(comment.id)">发送</button>
            </div>
          </div>
        </li>
      </ul>

      <!-- 加载更多（可选） -->
      <button v-if="hasMoreComments" class="load-more" @click="loadMoreComments">
        加载更多评论
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { useUIStore } from "@/stores/ui";
import { useUserStore } from "@/stores/user";
import { formatRelativeTime, formatAbsoluteTime } from "@/utils/time";
import { post } from "@/utils/request";
const ui = useUIStore();
const userStore = useUserStore();

const sortOptions = [
  { label: "最热", sortBy: "likes" },
  { label: "最新", sortBy: "update" },
];

const commentInputRef = ref(null);
const newComment = ref("");
const replyInputs = ref({});
const showReplyInputId = ref(null);
const currentSort = ref(sortOptions[0].sortBy);

const props = defineProps({
  postId: [String, Number], // 接收帖子ID，用于请求数据
});

const emit = defineEmits(["close"]);

const handleSort = (sortBy) => {
  currentSort.value = sortBy;
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
.comment-section {
  display: inline-block;
  width: 100%;
  /* border-top: 1px solid var(--border-color); */
  padding-top: 5px;
}

.comment-section-header {
  line-height: 30px;
  display: flex;
  align-items: center;
}

.comment-title {
  display: flex;
  align-items: center;
}

.comment-title-text {
  font-size: 1.275rem;
  font-weight: 500;
  margin-left: 8px;
}

.comment-title-count {
  margin: 0px 30px 0px 6px;
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.comment-sort {
  display: flex;
  align-items: center;
}

.comment-sort-item {
  display: flex;
  align-items: center;
  user-select: none;
}

.comment-sort-label {
  margin: 0px 8px;
  font-size: 0.875rem;
  opacity: 0.5;
  cursor: pointer;
}

.comment-sort-label:hover {
  color: var(--primary-color);
  opacity: 1;
}

.comment-sort-label.active {
  opacity: 1;
}

.comment-sort-divider {
  display: inline-block;
  height: 11px;
  margin: 0px 3px;
  border-left: solid 1px var(--text-secondary);
  vertical-align: -2px;
}

.comment-content {
  padding: 8px 20px;
}

.comment-input {
  display: flex;
  user-select: none;
}

.comment-login-tip {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.875rem;
  margin-bottom: 16px;
  color: var(--text-secondary);
}

.comment-input-area {
  flex: 1;
  font-size: 0.9rem;
  margin: 2px 20px;
  min-height: 46px;
}

.comment-textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  resize: none;
  overflow-y: auto;
}

.comment-submit {
  padding: 8px 16px;
  background: var(--primary-color);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.comment-list {
  list-style: none;
  padding: 0;
}

.comment-item {
  display: flex;
  margin-bottom: 16px;
}

.comment-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  margin-right: 12px;
  object-fit: cover;
}

.comment-body {
  flex: 1;
}

.comment-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.comment-author {
  font-weight: bold;
}

.comment-time {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.reply-btn {
  font-size: 0.8rem;
  color: var(--primary-color);
  background: none;
  border: none;
  cursor: pointer;
}

.reply-list {
  margin-top: 8px;
  padding-left: 20px;
  list-style: none;
}

.reply-item {
  margin-bottom: 6px;
  font-size: 0.9rem;
}

.reply-author {
  color: var(--primary-color);
  margin-right: 6px;
}

.reply-time {
  color: var(--text-secondary);
  font-size: 0.8rem;
  margin-left: 6px;
}

.reply-input {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.reply-text {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
}
</style>
