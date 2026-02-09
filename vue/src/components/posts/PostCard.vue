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
      <h3 v-if="post.title" class="post-card__title">{{ post.title }}</h3>
      <div class="post-card__content" v-html="sanitizeContent(post.content)"></div>

      <!-- 图片展示 -->
      <div
        v-if="post.media && post.media.length"
        class="post-card__media"
        :class="imageLayout"
      >
        <PostImage
          v-for="(item, index) in post.media"
          :key="item.id"
          :src="item.thumbnail_url"
          :preview-list="post.media.map((item) => item.preview_url)"
          :index="index"
          :width="imgWidth"
          :height="imgHeight"
          :error-text="item.alt || '图片加载失败'"
        />
      </div>
    </div>

    <!-- 底部操作区 -->
    <footer class="post-card__footer">
      <div class="post-card__stats">
        <div class="post-card__stat views">
          <IconForward size="18" />
          {{ post.forward ? formatNumber(post.forward) : "转发" }}
        </div>
        <div
          class="post-card__stat"
          :class="{ active: commentVisible }"
          @click="toggleComment"
        >
          <IconComment size="18" />
          {{ post.commentsCount ? formatNumber(post.commentsCount) : "评论" }}
        </div>
        <div class="post-card__stat">
          <IconLike size="18" />
          {{ post.likes ? formatNumber(post.likes) : "点赞" }}
        </div>
      </div>
    </footer>

    <!-- 评论区 -->
    <section class="post-card__comments" v-if="commentVisible">
      <PostComment :post-id="post.id" />
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

const moreDropdownVisible = ref(false);
const commentVisible = ref(false);

// Computed
const isAuthor = computed(() => {
  return userStore.user?.id === props.post.author.id;
});

const imageLayout = computed(() => {
  const len = props.post.media?.length || 0;
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
  return props.post.media?.slice(0, 9) || [];
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

const toggleComment = () => {
  commentVisible.value = !commentVisible.value;
};
</script>

<style scoped>
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
  /* border-top: 1px solid var(--border-color); */
  padding-top: 12px;
}

.post-card__stats {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 5px 20px;
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
