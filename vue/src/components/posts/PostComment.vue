<template>
  <div class="comment-section">
    <div class="comment-section-header">
      <div class="comment-title">
        <span class="comment-title-text">评论</span>
        <span class="comment-title-count"> {{ commentsCount }}</span>
      </div>
      <div class="comment-sort">
        <div class="comment-sort-item" v-for="(option, index) in sortOptions" :key="index"
          @click="handleSort(option.sortBy)">
          <span class="comment-sort-label" :class="{ active: currentSort === option.sortBy }">{{ option.label }}</span>
          <div class="comment-sort-divider" v-if="index != sortOptions.length - 1"></div>
        </div>
      </div>
    </div>
    <div class="comment-content">
      <!-- 评论输入框 -->
      <div class="comment-input">
        <Avatar :src="userStore.user?.avatar" alt="" :size="40" />
        <div class="comment-input-area">
          <div v-if="!userStore.isLogin" class="comment-login-tip">登录后可发表评论~</div>
          <InputTextarea v-else v-model="commentContent" placeholder="天青色等烟雨，而我在等你..." @submit="handleCommentSubmit" :max-image-count="1" />
        </div>
      </div>

      <!-- 评论列表 -->
      <ul v-if="displayedComments.length" class="comment-list">
        <li v-for="comment in displayedComments" :key="comment.id" class="comment-item">
          <div class="comment-avatar">
            <Avatar :src="comment.author.avatar" alt="" :size="40" />
          </div>
          <div class="comment-body">
            <div class="comment-header">
              <span class="comment-author" :style="getAuthorStyle(comment.author)">
                {{ comment.author.name }}
              </span>
            </div>

            <div class="comment-main">
              <p class="comment-text">
                {{ comment.content }}
              </p>
              <img
                v-if="comment.image"
                :src="comment.image"
                class="comment-image"
                alt="评论图片"
                @click="previewImage(comment.image)"
              />
            </div>

            <div class="comment-footer">
              <span class="comment-time">
                {{ formatRelativeTime(comment.createdAt) }}
              </span>
              <div class="comment-actions">
                <button class="comment-action" :class="{ liked: likedComments.has(comment.id) }" @click="handleCommentLike(comment)">
                  <IconLike size="14" />
                  <span v-if="(comment.likes ?? 0) > 0" class="comment-like-count">
                    {{ comment.likes }}
                  </span>
                </button>
                <button class="comment-action" @click="toggleReplyInput(comment.id, null)">
                  回复
                </button>
                <button
                  v-if="canDeleteComment(comment)"
                  class="comment-action comment-action--danger"
                  @click="handleCommentDelete(comment)"
                >
                  删除
                </button>
              </div>
            </div>


            <ul v-if="getVisibleReplies(comment).length" class="reply-list">
              <li v-for="reply in getVisibleReplies(comment)" :key="reply.id" class="reply-item">
                <div class="reply-avatar">
                  <Avatar :src="reply.author.avatar" alt="" :size="24" />
                </div>
                <div class="reply-body">
                  <div class="reply-main">
                    <span class="reply-author" :style="getAuthorStyle(reply.author)">{{ reply.author.name }}</span>
                    <span class="reply-content">
                      <template v-if="reply.replyTo">
                        回复 <span class="reply-target">@{{ reply.replyTo }}</span>：
                      </template>
                      {{ reply.content }}
                    </span>
                  </div>
                  <div class="reply-meta">
                    <span class="reply-time">{{ formatAbsoluteTime(reply.createdAt) }}</span>
                    <button class="reply-meta-action" :class="{ liked: likedComments.has(reply.id) }" @click="handleCommentLike(reply)">
                      <IconLike size="14" />
                      <span v-if="(reply.likes ?? 0) > 0" class="reply-like-count">
                        {{ reply.likes }}
                      </span>
                    </button>
                    <button class="reply-meta-action" @click="toggleReplyInput(comment.id, reply.author.name)">
                      回复
                    </button>
                    <button
                      v-if="userStore.user?.id === reply.author.id"
                      class="reply-meta-action reply-meta-action--danger"
                      @click="handleCommentDelete(reply)"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </li>
            </ul>
            <!-- 回复汇总与列表 -->
            <div v-if="shouldShowReplySummary(comment) && !isRepliesExpanded(comment.id)" class="reply-summary">
              <span class="reply-summary-text">
                共 {{ comment.replies.length }} 条回复，
              </span>
              <button class="reply-summary-action" @click="toggleRepliesExpanded(comment.id)">
                点击查看
              </button>
            </div>
            <div v-if="comment.replies?.length && isRepliesExpanded(comment.id) && getReplyPageCount(comment) > 1"
              class="reply-pagination">
              <span class="reply-page-total">共 {{ getReplyPageCount(comment) }} 页</span>

              <button v-if="(replyPage[comment.id] || 1) > 1" class="reply-page-link"
                @click="changeReplyPage(comment, (replyPage[comment.id] || 1) - 1)">
                上一页
              </button>

              <div class="reply-page-numbers">
                <template v-for="p in getReplyPageList(comment)" :key="String(p)">
                  <span v-if="p === '...'" class="reply-page-ellipsis">...</span>
                  <button v-else class="reply-page-number" :class="{ active: p === (replyPage[comment.id] || 1) }"
                    @click="changeReplyPage(comment, p)">
                    {{ p }}
                  </button>
                </template>
              </div>

              <button v-if="(replyPage[comment.id] || 1) < getReplyPageCount(comment)" class="reply-page-link"
                @click="changeReplyPage(comment, (replyPage[comment.id] || 1) + 1)">
                下一页
              </button>

              <button class="reply-page-link reply-collapse-btn" @click="toggleRepliesExpanded(comment.id)">
                收起
              </button>
            </div>

            <!-- 回复输入框 -->
            <div v-if="showReplyInputId === comment.id" class="reply-input">
              <Avatar :src="userStore.user?.avatar" alt="" :size="40" />
              <div class="reply-input-area">
                <InputTextarea  v-model="replyInputs[comment.id]" :placeholder="replyTargets[comment.id]
                ? `回复 @${replyTargets[comment.id]}`
                : `回复 @${comment.author.name}`
                " @submit="submitReply(comment.id)" 
                :show-image="false"
                />
              </div>
            </div>
          </div>
        </li>
      </ul>
      <div v-else-if="mode !== 'full'" class="no-more-comments">没有更多评论</div>

      <!-- 预览模式：查看更多评论 -->
      <div v-if="hasMorePreview" class="comment-more">
        <span class="load-more" @click="navigateToFull">
          查看更多评论
        </span>
      </div>

      <!-- 全量模式：无限滚动加载 -->
      <div v-if="mode === 'full'" ref="sentinelRef" class="comment-sentinel">
        <span v-if="fullLoading">加载中...</span>
        <span v-else-if="!fullHasMore && displayedComments.length > 0" class="no-more-comments">没有更多评论</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, nextTick } from "vue";
import { useRouter } from "vue-router";
import { useUIStore } from "@/stores/ui";
import { useUserStore } from "@/stores/user";
import { formatRelativeTime, formatAbsoluteTime } from "@/utils/time";
import { getComments, getCommentsPaginated, createComment, deleteComment, likeComment, unlikeComment } from "@/api/posts";
import { uploadPostImage } from "@/api/file";
import IconLike from "@/components/icons/IconLike.vue";
const ui = useUIStore();
const userStore = useUserStore();
const router = useRouter();

const sortOptions = [
  { label: "最热", sortBy: "likes" },
  { label: "最新", sortBy: "update" },
];


const replyInputs = ref({});
const replyTargets = ref({});
const showReplyInputId = ref(null);
const expandedReplies = ref({});
const replyPage = ref({});
const REPLIES_PAGE_SIZE = 10;
const currentSort = ref(sortOptions[0].sortBy);

const props = defineProps({
  postId: [String, Number], // 接收帖子ID，用于请求数据
  postAuthorId: [String, Number],
  commentsCount: { type: Number, default: 0 },
  mode: { type: String, default: "preview" }, // 'preview' | 'full'
  maxComments: { type: Number, default: 10 },  // 预览模式最多显示条数
});

const emit = defineEmits(["close", "comment", "reply", "comment-deleted", "comments-loaded"]);

const handleSort = (sortBy) => {
  currentSort.value = sortBy;
  updateSortedComments();
};

const sortedComments = ref([]);

const isAdmin = computed(() => userStore.roles?.includes("admin"));
const canDeleteComment = (comment) => {
  const currentUserId = userStore.user?.id;
  if (!currentUserId) return false;
  const isOwner = currentUserId === comment.author?.id;
  const isPostAuthor = comment.parentId == null && currentUserId === Number(props.postAuthorId);
  return isOwner || isAdmin.value || isPostAuthor;
};

const updateSortedComments = () => {
  const list = Array.isArray(comments.value) ? [...comments.value] : [];
  const sortBy = currentSort.value;

  const byCreatedAtDesc = (a, b) =>
    new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime();
  const byLikesDesc = (a, b) => {
    const diff = (b?.likes ?? 0) - (a?.likes ?? 0);
    return diff !== 0 ? diff : byCreatedAtDesc(a, b);
  };

  sortedComments.value = list.sort(sortBy === "update" ? byCreatedAtDesc : byLikesDesc);
};

// 评论区相关逻辑
const commentContent = ref("");



// 发布评论
const handleCommentSubmit = async (payload) => {
  const content = payload?.content || commentContent.value;
  const imageFiles = payload?.image;
/*   if (!content.trim() && (!imageFiles || imageFiles.length === 0)) return; */
  if (!userStore.isLogin) {
    ui.openLoginModal();
    return;
  }
  try {
    // 上传图片（如果有）
    let imageUrl = null;
    if (imageFiles && imageFiles.length > 0) {
      const uploadRes = await uploadPostImage(imageFiles[0]);
      imageUrl = uploadRes.data?.url || uploadRes.data;
    }

    const res = await createComment(props.postId, { content: content.trim(), image: imageUrl });
    // 新评论添加到列表顶部（全量模式仅添加顶级评论，回复不影响列表）
    const newComment = res.data;
    if (!newComment.parentId || props.mode === "full") {
      comments.value.unshift(newComment);
    }
    updateSortedComments();
    emit("comment");
  } catch (e) {
    console.error("发表评论失败", e);
  }
  commentContent.value = "";
};

const toggleReplyInput = (commentId, targetName) => {
  const nextTarget = targetName || null;
  const isSameComment = showReplyInputId.value === commentId;
  const currentTarget = replyTargets.value[commentId] || null;

  // 同一条评论下：再次点“同一个目标”才关闭；点“不同目标”只切换 @ 人
  if (isSameComment && currentTarget === nextTarget) {
    showReplyInputId.value = null;
    replyTargets.value[commentId] = null;
    return;
  }

  showReplyInputId.value = commentId;
  replyTargets.value[commentId] = nextTarget;
  if (replyInputs.value[commentId] === undefined) {
    replyInputs.value[commentId] = "";
  }
};

const submitReply = async (commentId) => {
  let content = replyInputs.value[commentId]?.trim();
  if (!content) return;
  const target = replyTargets.value[commentId];
  if (target && !content.startsWith(`@${target}`)) {
    content = `@${target} ${content}`;
  }
  try {
    const res = await createComment(props.postId, {
      content,
      parentId: commentId,
      replyTo: target || null
    });
    // 将新回复添加到对应评论的子回复列表
    const parentComment = comments.value.find(c => c.id === commentId);
    if (parentComment) {
      if (!parentComment.replies) parentComment.replies = [];
      parentComment.replies.push(res.data);
    }
    emit("reply", { commentId, content, replyTo: target || null });
  } catch (e) {
    console.error("回复失败", e);
  }
  replyInputs.value[commentId] = "";
  showReplyInputId.value = null;
  replyTargets.value[commentId] = null;
};

const isRepliesExpanded = (commentId) => !!expandedReplies.value[commentId];

const toggleRepliesExpanded = (commentId) => {
  if (!expandedReplies.value[commentId]) {
    expandedReplies.value[commentId] = true;
    if (!replyPage.value[commentId]) {
      replyPage.value[commentId] = 1;
    }
  } else {
    expandedReplies.value[commentId] = false;
  }
};

const getReplyPageCount = (comment) => {
  const total = comment.replies?.length || 0;
  return total ? Math.ceil(total / REPLIES_PAGE_SIZE) : 0;
};

const getHotReplies = (comment) => {
  const list = comment.replies || [];
  // 约定：isHot 为 true 的是高赞回复
  return list.filter((r) => r.isHot).sort((a, b) => (b?.likes ?? 0) - (a?.likes ?? 0));
};

const shouldShowReplySummary = (comment) => {
  const total = comment.replies?.length || 0;
  if (!total) return false;
  const hotCount = getHotReplies(comment).length;
  // 如果全部回复都是高赞并且已经都会显示，则不需要“共 X 条回复”
  return hotCount < total;
};

const getVisibleReplies = (comment) => {
  const list = comment.replies || [];
  if (!expandedReplies.value[comment.id]) {
    // 折叠状态：只展示前 2 条高赞回复；如果没有高赞则不展示
    const hot = getHotReplies(comment);
    return hot.slice(0, Math.min(2, hot.length));
  }
  // 展开状态：统一按时间排序（旧 -> 新）
  const sortedByTime = [...list].sort(
    (a, b) => new Date(a?.createdAt || 0).getTime() - new Date(b?.createdAt || 0).getTime()
  );
  const page = replyPage.value[comment.id] || 1;
  const start = (page - 1) * REPLIES_PAGE_SIZE;
  return sortedByTime.slice(start, start + REPLIES_PAGE_SIZE);
};

const changeReplyPage = (comment, newPage) => {
  const totalPages = getReplyPageCount(comment);
  if (newPage < 1 || newPage > totalPages) return;
  replyPage.value[comment.id] = newPage;
};

const getReplyPageList = (comment) => {
  const total = getReplyPageCount(comment);
  const current = replyPage.value[comment.id] || 1;
  if (total <= 1) return [1];

  const pages = new Set([1, total, current]);
  for (let p = current - 1; p <= current + 1; p++) {
    if (p >= 1 && p <= total) pages.add(p);
  }

  const sorted = Array.from(pages).sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < sorted.length; i++) {
    out.push(sorted[i]);
    const next = sorted[i + 1];
    if (next && next - sorted[i] > 1) out.push("...");
  }
  return out;
};

const getAuthorStyle = (author) => ({
  color: author?.nameColor || "var(--text-primary, #18191c)",
});

const comments = ref([]);

// 本地追踪点赞状态（当前会话内有效）
const likedComments = ref(new Set());

// 全量模式分页状态
const fullPageNum = ref(1);
const fullTotalPages = ref(1);
const fullLoading = ref(false);
const fullHasMore = ref(true);
const LOAD_MORE_SIZE = 20;
const sentinelRef = ref(null);

// 切换到全量模式加载
const loadFullComments = async (reset = false) => {
  if (!props.postId || fullLoading.value) return;
  if (!reset && !fullHasMore.value) return;
  fullLoading.value = true;
  try {
    const page = reset ? 1 : fullPageNum.value;
    const res = await getCommentsPaginated(props.postId, page, LOAD_MORE_SIZE);
    const pageData = res?.data;
    const list = pageData?.list || [];
    if (reset) {
      comments.value = list;
    } else {
      comments.value = [...comments.value, ...list];
    }
    fullTotalPages.value = pageData?.pages || 1;
    fullPageNum.value = page + 1;
    fullHasMore.value = fullPageNum.value <= fullTotalPages.value;
    // 初始化点赞状态
    const newLiked = new Set(likedComments.value);
    const walk = (items) => {
      for (const c of items) {
        if (c.likedByMe) newLiked.add(c.id);
        if (c.replies) walk(c.replies);
      }
    };
    walk(list);
    likedComments.value = newLiked;
    updateSortedComments();
  } catch (e) {
    console.error("加载评论失败", e);
  } finally {
    fullLoading.value = false;
  }
};

// 预览模式：全量加载
const loadPreviewComments = async () => {
  if (!props.postId) return;
  try {
    const res = await getComments(props.postId);
    comments.value = res?.data || [];
    const newLiked = new Set();
    const walk = (list) => {
      for (const c of list) {
        if (c.likedByMe) newLiked.add(c.id);
        if (c.replies) walk(c.replies);
      }
    };
    walk(comments.value);
    likedComments.value = newLiked;
    updateSortedComments();
  } catch (e) {
    console.error("加载评论失败", e);
  }
};

// 显示的评论列表：预览模式截取前 N 条
const displayedComments = computed(() => {
  if (props.mode === "preview") {
    return sortedComments.value.slice(0, props.maxComments);
  }
  return sortedComments.value;
});

// 预览模式下是否还有更多
const hasMorePreview = computed(() => {
  return props.mode === "preview" && comments.value.length > props.maxComments;
});

// 进入全量模式（通过路由跳转）
const navigateToFull = () => {
  router.push(`/post/${props.postId}`);
};

// 无限滚动观察器
let observer = null;
const setupInfiniteScroll = () => {
  if (props.mode !== "full") return;
  nextTick(() => {
    if (!sentinelRef.value) return;
    observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && fullHasMore.value && !fullLoading.value) {
          loadFullComments();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(sentinelRef.value);
  });
};

onUnmounted(() => {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
});

const loadComments = async () => {
  if (props.mode === "full") {
    await loadFullComments(true);
    setupInfiniteScroll();
  } else {
    await loadPreviewComments();
  }
};

onMounted(() => {
  loadComments();
});

// 点赞/取消点赞评论（带防抖，防止连点引发竞态）
const commentLiking = ref(new Set());
const handleCommentLike = async (comment) => {
  if (!userStore.isLogin) {
    ui.openLoginModal();
    return;
  }
  const commentId = comment.id;
  if (commentLiking.value.has(commentId)) return; // 该评论正在处理中
  commentLiking.value.add(commentId);

  const isLiked = likedComments.value.has(commentId);
  // 乐观更新
  if (isLiked) {
    likedComments.value.delete(commentId);
    comment.likes = Math.max(0, (comment.likes || 0) - 1);
  } else {
    likedComments.value.add(commentId);
    comment.likes = (comment.likes || 0) + 1;
  }
  try {
    if (isLiked) {
      await unlikeComment(commentId);
    } else {
      await likeComment(commentId);
    }
  } catch (e) {
    // 回滚
    if (isLiked) {
      likedComments.value.add(commentId);
      comment.likes = (comment.likes || 0) + 1;
    } else {
      likedComments.value.delete(commentId);
      comment.likes = Math.max(0, (comment.likes || 0) - 1);
    }
  } finally {
    commentLiking.value.delete(commentId);
  }
};

// 删除评论
const handleCommentDelete = async (comment) => {
  try {
    await ElMessageBox.confirm("确定删除这条评论？", "提示", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
    });
    await deleteComment(comment.id);
    // 检查是否是顶级评论
    const topLevelIndex = comments.value.findIndex(c => c.id === comment.id);
    if (topLevelIndex !== -1) {
      comments.value.splice(topLevelIndex, 1);
    } else {
      // 是子回复，从父评论中移除
      for (const c of comments.value) {
        if (c.replies) {
          const replyIndex = c.replies.findIndex(r => r.id === comment.id);
          if (replyIndex !== -1) {
            c.replies.splice(replyIndex, 1);
            break;
          }
        }
      }
    }
    // 立即刷新排序后的显示列表
    updateSortedComments();
    emit("comment-deleted");
  } catch (e) {
    // 取消或错误（已在拦截器处理）
  }
};

const previewImage = (url) => {
  window.open(url, "_blank", "noopener,noreferrer");
};
</script>

<style scoped>
.comment-section {
  display: inline-block;
  width: 100%;
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
  padding: 12px 20px;
  margin-top: 4px;
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
  color: var(--text-secondary);
}

.comment-input-area {
  display: flex;
  flex: 1;
  font-size: 0.9rem;
  margin: 2px 20px;
  align-items: center;
  justify-content: center;
}

.comment-list {
  list-style: none;
  padding: 0;
  margin-top: 16px;
}

.comment-item {
  display: flex;
  padding: 16px 0;
  border-bottom: 1px solid var(--border-color);
}

.comment-avatar {
  margin-right: 12px;
}

.comment-body {
  flex: 1;
}

.comment-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 0.875rem;
}

.comment-author {
  font-weight: 500;
  color: var(--text-primary, #18191c);
}

.comment-time {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.comment-main {
  margin: 2px 0 4px;
}

.comment-text {
  font-size: 0.9rem;
  margin-block-start: 0;
  margin-block-end: 0;
  margin-inline-start: 0;
  margin-inline-end: 0;

  line-height: 1.2;
  color: var(--text-primary, #18191c);
  white-space: pre-wrap;
}

.comment-image {
  max-width: 200px;
  max-height: 200px;
  border-radius: 6px;
  margin-top: 8px;
  cursor: pointer;
  object-fit: cover;
  border: 1px solid var(--border-color);
}

.comment-footer {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  margin-top: 8px;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.comment-actions {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-left: 16px;
}

.comment-action {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 4px;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.comment-like-count {
  min-width: 14px;
  text-align: left;
}

.comment-action:hover {
  color: var(--primary-color);
}

.comment-action.liked {
  color: var(--primary-color);
}

.comment-action--danger:hover {
  color: #ff4d4f;
}

.reply-list {
  margin-top: 16px;
  padding: 8px 12px;
  list-style: none;
/*   background: rgba(0, 0, 0, 0.02); */
  border-radius: 4px;
}

.reply-item {
  display: flex;
  margin-bottom: 18px;
  font-size: 0.85rem;
}

.reply-item:last-child {
  margin-bottom: 0;
}

.reply-avatar {
  margin-right: 8px;
  margin-top: 2px;
}

.reply-body {
  flex: 1;
}

.reply-main {
  line-height: 1.5;
}

.reply-author {
  font-weight: 500;
  margin-right: 4px;
}

.reply-content {
  word-break: break-word;
}

.reply-target {
  color: var(--primary-color);
}

.reply-meta {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  margin-top: 8px;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.reply-meta-action {
  margin-left: 12px;
  border: none;
  background: transparent;
  font-size: 0.85rem;
  color: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 4px;
}

.reply-meta-action:hover {
  color: var(--primary-color);
}

.reply-meta-action.liked {
  color: var(--primary-color);
}

.reply-meta-action--danger:hover {
  color: #ff4d4f;
}

.reply-like-count {
  min-width: 10px;
  text-align: left;
}

.reply-input {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.reply-input-area {
  flex: 1;
  padding: 4px 8px;
  margin-right: 20px;
}

.comment-more {
  display: flex;
  justify-content: center;
  padding: 4px 0 4px;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.no-more-comments {
  display: flex;
  justify-content: center;
  padding: 12px 0 4px;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.reply-summary {
  margin-top: 6px;
  font-size: 0.8rem;
  color: var(--text-secondary);
  user-select: none;
  display: flex;
  align-items: center;
}

.reply-summary-text {
  margin-right: 4px;
}

.reply-summary-action {
  padding: 0;
  border: none;
  background: transparent;
  font-size: 0.8rem;
  color: var(--text-secondary);
  cursor: pointer;
}

.reply-summary-action:hover {
  color: var(--primary-color);
  /* text-decoration: underline; */
}

.reply-pagination {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.reply-collapse-btn {
  margin-left: 4px;
}

.reply-page-total {
  margin-right: 4px;
  user-select: none;
}

.reply-page-link {
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.reply-page-link:hover {
  color: var(--primary-color);
  /* text-decoration: underline; */
}

.reply-page-numbers {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.reply-page-number {
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  min-width: 14px;
  text-align: center;
}

.reply-page-number:hover {
  color: var(--primary-color);
  /* text-decoration: underline; */
}

.reply-page-number.active {
  color: var(--primary-color);
  font-weight: 600;
  /* text-decoration: underline; */
}

.reply-page-ellipsis {
  user-select: none;
}

.comment-sentinel {
  display: flex;
  justify-content: center;
  padding: 12px 0;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.load-more{
  display: flex;
  justify-content: center;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.load-more:hover{
  cursor: pointer;
  color: var(--primary-color);
}


</style>
