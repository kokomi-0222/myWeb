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
      <!-- 作者信息：一行 meta：名字 · 徽章 · 时间 -->
      <div class="post-card__author-info">
        <div class="post-card__meta">
          <span class="post-card__author-name" :style="{ color: post.author.nameColor }">
            {{ post.author.name }}
          </span>
          <span v-if="post.author.primaryRole === 'admin'" class="post-card__role-badge">管理员</span>
          <span class="post-card__time-divider" aria-hidden="true">·</span>
          <time class="post-card__time">{{ formatRelativeTime(post.createdAt) }}</time>
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
        <h3
          v-if="post.title"
          class="post-card__title"
          :class="{ 'post-card__title--link': clickable }"
          :title="clickable ? '查看详情' : undefined"
          @click="goDetail"
        >
          {{ post.title }}
        </h3>
        <span v-if="post.type" class="post-card__type-tag">{{ typeLabel }}</span>
      </div>
      <!-- 正文：列表页超过若干行折叠起来，详情页完整展示 -->
      <div class="post-card__content-wrap">
        <div
          ref="contentRef"
          class="post-card__content"
          :class="{ 'is-clamped': isClamped }"
          v-html="sanitizeContent(post.content)"
        ></div>
      </div>
      <button
        v-if="canCollapse"
        type="button"
        class="post-card__expand"
        :aria-expanded="expanded ? 'true' : 'false'"
        @click.stop="toggleExpand"
      >
        <span>{{ expanded ? "收起" : "展开全文" }}</span>
        <svg
          class="post-card__expand-icon"
          :class="{ 'is-open': expanded }"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          aria-hidden="true"
        >
          <path
            d="M2.5 4.5 6 8l3.5-3.5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <!-- 无标题时的详情入口兜底 -->
      <button
        v-if="clickable && !post.title"
        type="button"
        class="post-card__read-more"
        @click="goDetail"
      >
        查看详情 ›
      </button>
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
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from "vue";
import { useUserStore } from "@/stores/user";
import { useUIStore } from "@/stores/ui";
import DOMPurify from "dompurify"; // 防 XSS
import { usePermission } from "@/utils/usePermission";
import { ALL_ACTIONS } from "@/utils/postActions";
import { formatRelativeTime, formatAbsoluteTime } from "@/utils/time";
import { deletePosts, likePost, unlikePost } from "@/api/posts";
import { useRouter } from "vue-router";

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
  // 是否允许从卡片进入详情页。详情页自身复用本组件时要传 false，避免自己跳自己
  clickable: {
    type: Boolean,
    default: true,
  },
  // 超长正文是否折叠。详情页传 false，直接全文展示，不需要再点「展开全文」
  collapsible: {
    type: Boolean,
    default: true,
  },
});

// Emits
const emit = defineEmits(["like", "comment", "reply", "edit", "delete"]);

// Router
const router = useRouter();

// 进入帖子详情页
const goDetail = () => {
  if (!props.clickable) return;
  // 用户在标题上拖动选中文字时不跳转，避免想复制却跳走
  if (window.getSelection()?.toString()) return;
  router.push(`/post/${props.post.id}`);
};

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

const TYPE_MAP = { tech: '技术', life: '生活', game: '游戏', music: '音乐', movie: '影视', article: '文章', other: '其他' };
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

const escapeHtml = (text) =>
  String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

// 正文本质是 textarea 提交的纯文本。这里只留一条极窄的富文本通道，
// 用于兼容可能存在的 <p> 老数据：
//   · 只放行最基础的排版标签，标题类 h1~h6 一律不放（会被用来撑大页面）
//   · ALLOWED_ATTR 为空 → style / class / on* / href / src 全部丢弃
// 实测这样可以挡掉：
//   <div style="position:fixed;inset:0;z-index:99999"> 伪造全屏登录框
//   <img src="https://外部地址">                         外链打点、违规图片
//   <h1 style="font-size:100px">                         破坏布局
const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    "p", "br",
    "strong", "b", "em", "i", "u", "s", "del",
    "blockquote", "pre", "code",
    "ul", "ol", "li", "hr",
  ],
  ALLOWED_ATTR: [],
};

/**
 * 把正文转成可交给 v-html 的字符串。
 *
 * 正文是纯文本，换行靠 CSS 的 white-space: pre-wrap 还原；但不能把纯文本
 * 直接塞进 v-html，否则 <b && c> 这类片段会被当成标签解析、连内容一起吞掉。
 * 所以先用受限白名单过一遍：清洗结果与原文不一致，说明这不是「干净的基础排版」，
 * 一律整体转义按纯文本显示，确保「用户敲了什么就显示什么」，且任何标签都不会被解释。
 */
const sanitizeContent = (raw) => {
  const text = String(raw ?? "");
  const cleaned = DOMPurify.sanitize(text, PURIFY_CONFIG);
  if (cleaned !== text) return escapeHtml(text);
  return cleaned;
};

// ---------- 长文折叠 ----------
// 列表页一篇帖子动辄上千字，整篇铺开会把后面的帖子全推到屏幕外。
// 超过 CSS 里 --post-preview-lines 指定的行数就折叠，想看全文可以就地展开，
// 也可以点标题进详情页。
const contentRef = ref(null);
const expanded = ref(false);
const overflowed = ref(false);

// 只有「允许折叠」且「确实超长」才出现按钮，短帖完全不受影响
const canCollapse = computed(() => props.collapsible && overflowed.value);
const isClamped = computed(() => canCollapse.value && !expanded.value);

/**
 * 量一次正文真实高度，判断是否需要折叠。
 * 测量前先把 max-height 解除：展开状态下 scrollHeight 会被 max-height 限制住，
 * 不解除的话「展开过一次之后就再也测不出溢出」，按钮会凭空消失。
 */
const measureOverflow = () => {
  const el = contentRef.value;
  if (!el || !props.collapsible) {
    overflowed.value = false;
    return;
  }
  const prevMax = el.style.maxHeight;
  el.style.maxHeight = "none";
  const fullHeight = el.scrollHeight;
  el.style.maxHeight = prevMax;

  // 行数与折叠高度都从 CSS 里读，避免 JS 和样式各写一份、改一处忘另一处
  const cs = getComputedStyle(el);
  const lineHeight = parseFloat(cs.lineHeight) || 0;
  const lines = parseInt(cs.getPropertyValue("--post-preview-lines"), 10) || 8;
  const limit = lineHeight * lines;
  overflowed.value = limit > 0 && fullHeight > limit + 2;
};

const toggleExpand = () => {
  expanded.value = !expanded.value;
};

// resize 触发很密，用 rAF 合帧，一帧最多量一次
let measureRaf = 0;
const scheduleMeasure = () => {
  if (measureRaf) return;
  measureRaf = requestAnimationFrame(() => {
    measureRaf = 0;
    measureOverflow();
  });
};

onMounted(() => {
  nextTick(measureOverflow);
  window.addEventListener("resize", scheduleMeasure);
  // 字体加载完字宽会变、换行跟着变，必须重量一次
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => measureOverflow()).catch(() => {});
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", scheduleMeasure);
  if (measureRaf) cancelAnimationFrame(measureRaf);
});

// 正文内容或折叠开关变化都要重量
watch(
  () => [props.post.content, props.collapsible],
  () => nextTick(measureOverflow)
);

// 同一张卡片被复用去显示另一篇帖子时，折叠状态回到默认
watch(
  () => props.post.id,
  () => {
    expanded.value = false;
    nextTick(measureOverflow);
  }
);

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
  --post-card-avatar-size: 44px;
  --post-card-gap: 12px;
  --post-card-align-indent: calc(var(--post-card-avatar-size) + var(--post-card-gap));
  background: var(--bg-primary);
  border-radius: 14px;
  padding: 20px 24px 4px;
  margin-bottom: 12px;
  border: 1px solid var(--border-color);
  transition:
    background-color 0.7s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.post-card:hover {
  border-color: var(--border-color-hover);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
}

.post-card__header {
  display: flex;
  align-items: center;
  margin-bottom: 14px;
  position: relative;
}

.post-card__avatar {
  margin-right: var(--post-card-gap);
}

.post-card__author-info {
  flex: 1;
  min-width: 0;
}

/* 名字 · 徽章 · 时间 一行 */
.post-card__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.post-card__author-name {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-primary);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: opacity 0.2s ease-in-out;
}

.post-card__author-name:hover {
  opacity: 0.8;
}

.post-card__role-badge {
  flex-shrink: 0;
  font-size: 0.7rem;
  font-weight: 600;
  color: #fb7299;
  background: rgba(251, 114, 153, 0.12);
  padding: 1px 8px;
  border-radius: 9px;
  white-space: nowrap;
}

.post-card__time-divider {
  color: var(--text-secondary);
  opacity: 0.6;
}

.post-card__time {
  font-size: 0.75rem;
  color: var(--text-secondary);
  white-space: nowrap;
  letter-spacing: 0.01em;
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
  border-radius: 8px;
  transition: background-color 0.15s ease;
}

.post-card__more-trigger:hover {
  background-color: var(--bg-hover);
}

.post-card__more-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.3;
  transition: opacity 0.15s ease;
}

.post-card__more:hover .post-card__more-icon {
  opacity: 0.65;
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
  margin-bottom: 12px;
  margin-left: var(--post-card-align-indent);
}

.post-card__title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.post-card__title {
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1.45;
  letter-spacing: -0.01em;
  margin: 0;
  color: var(--text-primary);
}

/* 可点击进详情页时给出手感提示 */
.post-card__title--link {
  cursor: pointer;
  transition: color 0.18s ease;
}

.post-card__title--link:hover {
  color: var(--primary-color);
}

.post-card__read-more {
  display: inline-flex;
  align-items: center;
  margin-top: 8px;
  padding: 0;
  border: 0;
  background: none;
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--primary-color);
  cursor: pointer;
}

.post-card__read-more:hover {
  text-decoration: underline;
}

.post-card__type-tag {
  flex-shrink: 0;
  padding: 2px 9px;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--primary-color);
  background: var(--primary-color-soft);
  border: none;
  border-radius: 6px;
  white-space: nowrap;
}

.post-card__content-wrap {
  position: relative;
}

.post-card__content {
  /* 折叠只保留这么多行，JS 通过 getComputedStyle 读这个变量，
     改行数只改这里，不用同步改脚本 */
  --post-preview-lines: 8;
  font-size: 0.9375rem;
  line-height: 1.75;
  color: var(--text-primary);
  word-break: break-word;
  /* 正文来自 textarea，是纯文本，换行符 \n 必须原样保留。
     CSS 默认的 white-space: normal 会把 \n 折叠成普通空格、
     把连续多个空格压成一个，看起来就是「格式全丢了」。
     评论区的 .comment-text 一直用的是 pre-wrap，这里之前漏了。 */
  white-space: pre-wrap;
  /* 超长英文串 / URL 不至于撑破卡片 */
  overflow-wrap: break-word;
}

/* 折叠态：高度按行高 × 行数算，底部用 mask 渐隐暗示还有内容。
   用 mask 而不是盖一层去色块，是因为遮罩色要跟卡片底色一致，
   亮色/暗色主题下底色不同，mask 天然跟随。 */
.post-card__content.is-clamped {
  max-height: calc(1.75em * var(--post-preview-lines));
  overflow: hidden;
  -webkit-mask-image: linear-gradient(to bottom, #000 78%, transparent 100%);
  mask-image: linear-gradient(to bottom, #000 78%, transparent 100%);
}

.post-card__expand {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  /* 负的左边距抵消按钮内边距，让文字与正文左边缘对齐 */
  margin: 2px 0 8px -10px;
  padding: 5px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--primary-color);
  font-family: inherit;
  font-size: 0.875rem;
  line-height: 1.4;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.post-card__expand:hover {
  background: var(--bg-nomarl);
}

.post-card__expand:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 1px;
}

.post-card__expand-icon {
  transition: transform 0.22s ease;
}

.post-card__expand-icon.is-open {
  transform: rotate(180deg);
}

.post-card__media {
  display: grid;
  gap: 8px;
  width: fit-content;
  overflow: hidden;
}

.post-card__footer {
  border-top: 1px solid var(--border-color);
  margin-left: var(--post-card-align-indent);
}

.post-card__stats {
  display: flex;
  align-items: center;
  gap: 2px;
  /* 负边距抵消首个按钮的左内边距，使图标与正文左对齐 */
  margin: 4px 0 4px -10px;
  color: var(--text-secondary);
  font-size: 0.8125rem;
  user-select: none;
}

.post-card__stat {
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: center;
  padding: 7px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition:
    color 0.15s ease,
    background-color 0.15s ease;
}

.post-card__stat:hover {
  color: var(--primary-color);
  background: var(--bg-nomarl);
}

/* 选中/展开态只变色，不加蓝色底色 */
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
    --post-card-avatar-size: 40px;
    --post-card-gap: 8px;
    padding: 14px 16px 6px;
    margin-bottom: 0;
    border-radius: 0;
    border-left: none;
    border-right: none;
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
    margin: 4px 0;
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
