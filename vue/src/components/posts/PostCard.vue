<template>
  <article class="post-card">
    <!-- 帖子头部 -->
    <header class="post-card__header">
      <!-- 作者头像 -->
      <Avatar
        class="post-card__avatar"
        :src="post.author.avatar"
        :alt="post.author.name"
        :size="48"
        :badge="post.author.badge"
      />
      <!-- 作者信息-->
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
      <!-- 更多操作 -->
      <div class="post-card__more">
        <Dropdown
          v-model:visible="moreDropdownVisible"
          :trigger="triggerMode"
          menu-class="dropdown-menu--postCard-more"
          :offset-y="5"
          :show-arrow="true"
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
      <div class="post-card__title-row">
        <h3 v-if="post.title" class="post-card__title">{{ post.title }}</h3>
        <span v-if="post.type" class="post-card__type-tag">{{ typeLabel }}</span>
      </div>
      <div class="post-card__content" v-html="sanitizeContent(post.content)"></div>
      <!-- 图片展示 -->
      <div v-if="post.media && post.media.length" class="post-card__media">
        <PostImage :media="post.media" />
      </div>
    </div>
    <!-- 底部操作区 -->
    <footer class="post-card__footer">
      <div class="post-card__stats">
        <div class="post-card__stat views">
          <IconForward size="18" />
          {{ forwardCount > 0 ? formatNumber(forwardCount) : "转发" }}
        </div>
        <div
          class="post-card__stat"
          :class="{ active: commentVisible }"
          @click="toggleComment"
        >
          <IconComment size="18" />
          {{ commentCount > 0 ? formatNumber(commentCount) : "评论" }}
        </div>
        <div
          class="post-card__stat"
          :class="{ active: post.likedByMe }"
          @click="toggleLike"
        >
          <IconLike size="18" />
          {{ likeCount > 0 ? formatNumber(likeCount) : "点赞" }}
        </div>
      </div>
    </footer>

    <!-- 评论区 -->
    <section class="post-card__comments" v-if="showComments && commentVisible">
      <PostComment
        :post-id="post.id"
        :post-author-id="post.author.id"
        :comments-count="commentCount"
        mode="preview"
        :max-comments="10"
        @comment="handleComment"
        @comment-deleted="handleCommentDeleted"
      />
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
import { deletePosts, likePost, unlikePost } from "@/api/posts";

import message from "@/utils/message";
// Props
const props = defineProps({
  post: {
    type: Object,
    required: true,
    validator(value) {
      return value.id && value.author && value.content !== undefined;
    },
  },
  showComments: {
    type: Boolean,
    default: true,
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

const moreDropdownVisible = ref(false);
const commentVisible = ref(false);
const liking = ref(false); // 防抖：防止快速连点引发竞态

const commentCount = computed(() => {
  const p = props.post || {};
  const raw =
    p.comments ??
    p.commentCount ??
    p.commentsCount ??
    p.comments_count ??
    p.comment_count ??
    p.comments?.length ??
    0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
});

const likeCount = computed(() => {
  const p = props.post || {};
  const raw = p.likes ?? p.likeCount ?? p.likesCount ?? p.likes_count ?? 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
});

const forwardCount = computed(() => {
  const p = props.post || {};
  const raw = p.forward ?? p.forwardCount ?? p.forwardsCount ?? p.forward_count ?? 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
});

const TYPE_MAP = { tech: '技术', life: '生活', game: '游戏', music: '音乐', movie: '影视', other: '其他' };
const typeLabel = computed(() => TYPE_MAP[props.post?.type] || props.post?.type || '');

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
  if (action.key === "delete") {
    ElMessageBox.confirm("确定删除这条帖子？", "提示", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
    })
      .then(async () => {
        try {
          await deletePosts(props.post.id);
          message.success("删除成功");
          emit("delete", props.post.id);
        } catch (e) {
          // 错误已在拦截器中处理
        }
      })
      .catch(() => {});
  } else if (action.key === "adminDelete") {
    ElMessageBox.confirm(
      `确定以管理员身份删除 ${props.post.author.name} 的帖子？`,
      "管理员操作",
      {
        confirmButtonText: "强制删除",
        cancelButtonText: "取消",
        type: "error",
      }
    )
      .then(async () => {
        try {
          await deletePosts(props.post.id);
          message.success("删除成功");
          emit("delete", props.post.id);
        } catch (e) {
          // 错误已在拦截器中处理
        }
      })
      .catch(() => {});
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

const toggleLike = async () => {
  if (liking.value) return; // 防止连点引发竞态
  const post = props.post;
  liking.value = true;
  if (post.likedByMe) {
    try {
      await unlikePost(post.id);
      post.likedByMe = false;
      post.likes = Math.max(0, (post.likes || 0) - 1);
    } catch (e) {
      // 错误已在拦截器中处理
    }
  } else {
    try {
      await likePost(post.id);
      post.likedByMe = true;
      post.likes = (post.likes || 0) + 1;
    } catch (e) {
      // 错误已在拦截器中处理
    }
  }
  liking.value = false;
};

const toggleComment = () => {
  commentVisible.value = !commentVisible.value;
};

const handleComment = () => {
  // 评论数 +1（本地更新，避免刷新整个列表）
  if (props.post) {
    const current = Number(props.post.commentsCount ?? props.post.comments ?? 0);
    props.post.commentsCount = current + 1;
  }
};

const handleCommentDeleted = () => {
  // 评论数 -1（本地更新）
  if (props.post) {
    const current = Number(props.post.commentsCount ?? props.post.comments ?? 0);
    props.post.commentsCount = Math.max(0, current - 1);
  }
};
</script>

<style scoped>
.post-card {
  --post-card-align-indent: calc(48px + 18px);
  background: var(--bg-primary);
  border-radius: 4px;
  padding: 16px 20px;
  margin-bottom: 18px;
  /*   box-shadow: 0 4px 12px var(--box-shadow); */
  border: 1px solid var(--border-color);
  transition: background-color 0.7s ease, color 0.7s ease;
}

.post-card__header {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
  position: relative;
}

.post-card__avatar {
  margin-right: 18px;
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
  margin-left: var(--post-card-align-indent);
}

.post-card__title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.post-card__title {
  font-size: 1.25rem;
  margin: 0;
  color: var(--text-primary);
}

.post-card__type-tag {
  padding: 1px 8px;
  margin-left: 6px;
  font-size: 0.7rem;
  color: var(--primary-color);
  background: transparent;
  border: 1px solid var(--primary-color);
  border-radius: 5px;
  white-space: nowrap;
  opacity: 0.8;
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

.post-card__footer {
  /* border-top: 1px solid var(--border-color); */
  padding-top: 12px;
  margin-left: var(--post-card-align-indent);
  margin-right: calc(var(--post-card-align-indent) + 30px);
}

.post-card__stats {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 5px 0;
  color: var(--text-secondary);
  font-size: 0.875rem;
  user-select: none;
}

.post-card__stat {
  display: flex;
  gap: 3px;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.post-card__stat:hover,
.post-card__stat.active {
  color: var(--primary-color);
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
  margin-top: 8px;
  padding-top: 8px;
}

@media (max-width: 768px) {
  .post-card {
    --post-card-align-indent: calc(40px + 8px);
    padding: 12px 12px;
  }

  .post-card__avatar {
    margin-right: 10px;
  }

  .post-card__ornament {
    margin-right: 12px;
  }

  .post-card__more {
    margin-right: 4px;
  }

  .post-card__footer {
    margin-left: 0;
    margin-right: 0;
  }

  .post-card__actions {
    flex-direction: column;
  }

  .post-card__stats {
    justify-content: space-evenly;
    gap: 0;
  }

  .post-card__stat {
    gap: 6px;
    padding: 6px 12px;
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
