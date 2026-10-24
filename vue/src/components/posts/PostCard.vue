<template>
  <article class="post-card">
    <!-- 帖子头部 -->
    <header class="post-card__header">
      <!-- 作者头像：点击进入作者主页 -->
      <span class="post-card__avatar-link" @click.stop="goUser">
        <Avatar
          class="post-card__avatar"
          :src="post.author.avatar"
          :alt="post.author.name"
          :size="48"
          :badge="post.author.badge"
        />
      </span>
      <!-- 作者信息：一行 meta：名字 · 徽章 · 时间 -->
      <div class="post-card__author-info">
        <div class="post-card__meta">
          <span
            class="post-card__author-name"
            :style="{ color: post.author.nameColor }"
            @click.stop="goUser"
          >
            {{ post.author.name }}
          </span>
          <span
            v-if="roleTagLabel"
            class="post-card__role-badge"
            :style="roleTagStyle"
          >{{ roleTagLabel }}</span>
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
          arrow-color="var(--dropdown-bg)"
          arrow-border-color="var(--border-color)"
        >
          <template #trigger>
            <div class="post-card__more-trigger">
              <div class="post-card__more-icon">
                <IconMore style="width: 24px; height: 28px" />
              </div>
            </div>
          </template>
          <template #menu="{ close }">
            <template v-for="(action, index) in moreActions" :key="action.key">
              <!-- 危险操作（删除类）与普通操作之间加一条分隔 -->
              <div
                v-if="action.danger && (index === 0 || !moreActions[index - 1].danger)"
                class="more-actions-divider"
                aria-hidden="true"
              ></div>
              <div
                class="more-actions-item"
                :class="{ 'is-danger': action.danger }"
                role="menuitem"
                @click="
                  () => {
                    moreActionsHandle(action);
                    close();
                  }
                "
              >
                <component
                  :is="ACTION_ICONS[action.key]"
                  v-if="ACTION_ICONS[action.key]"
                  class="more-actions-item__icon"
                  :size="15"
                />
                <span class="more-actions-item__label">{{ action.label }}</span>
              </div>
            </template>
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
          v-html="renderedContent"
          @click="handleContentClick"
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
        <div class="post-card__stat" title="转发这条帖子" @click.stop="handleForward">
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
import { useTopicStore } from "@/stores/topic";
import { useReportStore } from "@/stores/report";
import { renderPostContent } from "@/utils/postContent";
import { usePermission } from "@/utils/usePermission";
import { ALL_ACTIONS } from "@/utils/postActions";
import { formatRelativeTime, formatAbsoluteTime } from "@/utils/time";
import { deletePosts, likePost, unlikePost } from "@/api/posts";
import { confirmAndForward } from "@/utils/postForward";
import { copyPostLink } from "@/utils/sharePost";
import { roleLabelOf, shouldShowRoleTag, rolePillStyle } from "@/utils/roleTag";
import { useRouter } from "vue-router";

import message from "@/utils/message";
import IconEdit from "@/components/icons/IconEdit.vue";
import IconTrash from "@/components/icons/IconTrash.vue";
import IconFlag from "@/components/icons/IconFlag.vue";
import IconBan from "@/components/icons/IconBan.vue";
import IconShare from "@/components/icons/IconShare.vue";

// 「更多」菜单里每一项的图标，key 对应 utils/postActions.js 的 action.key
const ACTION_ICONS = {
  edit: IconEdit,
  delete: IconTrash,
  adminDelete: IconTrash,
  share: IconShare,
  report: IconFlag,
  block: IconBan,
};
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

// 身份标签：管理员/版主/编辑/会员才显示，普通用户不挂（否则每帖都是噪音）
// 颜色优先用作者被后台设的 roleColor，没设就沿用原来的粉
const roleTagLabel = computed(() =>
  shouldShowRoleTag(props.post?.author?.primaryRole)
    ? roleLabelOf(props.post.author.primaryRole)
    : ""
);
const roleTagStyle = computed(() => rolePillStyle(props.post?.author?.roleColor));

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
const topicStore = useTopicStore();
const reportStore = useReportStore();
topicStore.loadTopics();
// 已经举报过的帖子把菜单显示成「已举报」；store 内部保证整个列表只请求一次
reportStore.loadMine("post");

// 点击头像 / 昵称进入作者主页；自己的名字直接回个人空间
const goUser = () => {
  const authorId = props.post.author?.id;
  if (!authorId) return;
  if (userStore.isLogin && String(userStore.user?.id) === String(authorId)) {
    router.push("/space/home");
    return;
  }
  router.push(`/user/${authorId}`);
};

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

// 类型标签走话题字典：站长新建的话题也能正确显示名字，
// 字典里没有的历史值原样返回（labelOf 内部做了兜底）
const typeLabel = computed(() => topicStore.labelOf(props.post?.type));

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

  const list = ALL_ACTIONS.filter((action) => {
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

  // 已经举报过、还没处理完：把文案换成「已举报」，点它只弹提示
  return list.map((action) =>
    action.key === "report" && reportStore.hasReported("post", props.post.id)
      ? { ...action, label: "已举报" }
      : action
  );
});

// 处理点击
const moreActionsHandle = (action) => {
  if (action.key === "share") {
    // 分享 = 直接复制帖子链接，不弹面板
    copyPostLink(props.post);
    return;
  }
  if (action.key === "edit") {
    // 编辑复用个人空间顶部的发布框：带上 id 过去，那边会回填内容并切换成「保存修改」。
    // 放在卡片内部处理而不是 emit 给父组件，首页 / 详情页 / 他人主页 / 空间页
    // 四个入口就都自动生效，不用每个页面各写一遍。
    router.push({ path: "/space/home", query: { edit: props.post.id } });
    return;
  }
  if (action.key === "report") {
    if (reportStore.hasReported("post", props.post.id)) {
      message("你已经举报过了，我们正在处理", "info");
      return;
    }
    if (!userStore.isLogin) {
      ui.openLoginModal();
      return;
    }
    const summary = props.post.title || String(props.post.content || "").slice(0, 40);
    reportStore.open({ type: "post", id: props.post.id, label: summary });
    return;
  }
  if (action.key === "delete") {
    ElMessageBox.confirm("删除后无法恢复，确定继续吗？", "删除帖子", {
      confirmButtonText: "删除",
      cancelButtonText: "取消",
      type: "warning",
      customClass: "danger-confirm",
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
        customClass: "danger-confirm",
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

// 正文渲染：纯文本 + ``` 代码块 + `行内代码`（解析、转义、高亮都在 utils/postContent.js）。
// 用户写的标签一律被转义成文本，只有我们自己生成的代码块结构会交给浏览器解释。
const renderedContent = computed(() => renderPostContent(props.post.content));

/**
 * 代码块右上角的「复制」。
 * 按钮是 v-html 生成的，挂不了 Vue 事件，所以在正文容器上做事件委托；
 * 复制内容直接从 DOM 的 textContent 取，避免再存一份原文。
 */
const handleContentClick = async (event) => {
  const btn = event.target?.closest?.(".content-code__copy");
  if (!btn) return;
  const code = btn.closest(".content-code")?.querySelector(".content-code__pre code");
  const text = code?.textContent ?? "";
  try {
    await navigator.clipboard.writeText(text);
    const raw = btn.textContent;
    btn.textContent = "已复制";
    btn.classList.add("is-done");
    setTimeout(() => {
      btn.textContent = raw || "复制";
      btn.classList.remove("is-done");
    }, 1600);
  } catch {
    message.error("复制失败，请手动选中复制");
  }
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

// 转发：确认后计数 +1，并通知作者（详情由 utils/postForward 统一处理）
const handleForward = () => {
  confirmAndForward(props.post);
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

/* 头像可点击：鼠标手势与轻微反馈 */
.post-card__avatar-link {
  display: inline-flex;
  flex-shrink: 0;
  cursor: pointer;
  border-radius: 50%;
  transition: opacity 0.2s ease-in-out;
}

.post-card__avatar-link:hover {
  opacity: 0.85;
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
  background-color: var(--bg-nomarl);
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

/* ---------- 「更多」菜单项 ----------
   菜单容器自己只有 5px 内衬（见文件末尾未 scoped 的 .dropdown-menu--postCard-more），
   圆角和高亮都交给菜单项，形成「内衬式」菜单，hover 时不会顶到容器边角。 */
.more-actions-item {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 32px;
  padding: 0 10px;
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 0.8125rem;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.more-actions-item:hover,
.more-actions-item:focus-visible {
  background-color: var(--bg-nomarl);
  outline: none;
}

.more-actions-item__icon {
  flex: none;
  width: 15px;
  height: 15px;
  opacity: 0.62;
  transition: opacity 0.15s ease;
}

.more-actions-item:hover .more-actions-item__icon {
  opacity: 0.9;
}

/* 危险项（删除 / 强制删除）：常态就红，hover 加一层淡红底 */
.more-actions-item.is-danger {
  color: #f53f3f;
}

.more-actions-item.is-danger .more-actions-item__icon {
  opacity: 0.8;
}

.more-actions-item.is-danger:hover,
.more-actions-item.is-danger:focus-visible {
  background-color: rgba(245, 63, 63, 0.1);
  color: #e63939;
}

.more-actions-divider {
  height: 1px;
  margin: 4px 8px;
  background-color: var(--border-color);
  opacity: 0.7;
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
    /* 卡片之间留出 8px 呼吸位，之前是 0，一整列白块糊成一条 */
    margin-bottom: 8px;
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
/* 「更多」下拉菜单容器（Teleport 到 body，必须用非 scoped 样式）
   5px 内衬 + 12px 圆角，高亮由 .more-actions-item 自己画，形成内衬式菜单。
   ⚠️ 类名写两遍是为了压过 Dropdown.vue 里 `.global-dropdown-menu{min-width:10px}`
   的 scoped 选择器（它是 0,2,0，单类名只有 0,1,0 会失效） */
.dropdown-menu--postCard-more.dropdown-menu--postCard-more {
  min-width: 124px;
  padding: 5px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background-color: var(--dropdown-bg);
  box-shadow:
    0 10px 28px rgba(15, 23, 42, 0.14),
    0 2px 6px rgba(15, 23, 42, 0.06);
}

/* 暗色：更深的投影，避免和背景糊成一片 */
:root.dark .dropdown-menu--postCard-more {
  box-shadow:
    0 12px 32px rgba(0, 0, 0, 0.55),
    0 1px 3px rgba(0, 0, 0, 0.4);
}

/* ===== 正文里的代码块 / 行内代码 =====
   这两块是 v-html 生成的，拿不到 scoped 的 data-v 属性，只能写成全局样式。
   配色刻意用中性灰 + 克制的语法色，避免和站点的粉色主题打架。 */
.content-text {
  margin: 0;
}

.content-code {
  margin: 12px 0;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: #f6f8fa;
  overflow: hidden;
}

.content-code__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 8px 4px 12px;
  border-bottom: 1px solid var(--border-color);
  background: rgba(15, 23, 42, 0.02);
}

.content-code__lang {
  font-size: 12px;
  line-height: 20px;
  color: var(--text-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  letter-spacing: 0.02em;
  user-select: none;
}

.content-code__copy {
  border: none;
  background: transparent;
  padding: 2px 8px;
  border-radius: 6px;
  font-family: inherit;
  font-size: 12px;
  line-height: 18px;
  color: var(--text-secondary);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.content-code__copy:hover {
  color: var(--primary-color);
  background: var(--bg-hover);
}

.content-code__copy.is-done {
  color: var(--primary-color);
}

.content-code__pre {
  margin: 0;
  padding: 12px 14px;
  overflow-x: auto;
  background: transparent;
  font-size: 0.85rem;
  line-height: 1.6;
  tab-size: 4;
  -webkit-overflow-scrolling: touch;
}

.content-code__pre code {
  display: block;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas,
    "Liberation Mono", "Courier New", monospace;
  /* 代码不折行：宁可横向滚动，也别把缩进结构揉烂 */
  white-space: pre;
  color: #24292f;
  background: none;
  padding: 0;
  border: none;
  font-size: inherit;
}

.content-inline-code {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas,
    "Liberation Mono", "Courier New", monospace;
  font-size: 0.86em;
  padding: 1px 5px;
  border-radius: 4px;
  background: #f1f2f4;
  color: #c7254e;
  word-break: break-word;
}

/* 暗色 */
:root.dark .content-code {
  background: #0d1117;
}

:root.dark .content-code__head {
  background: rgba(255, 255, 255, 0.04);
}

:root.dark .content-code__pre code {
  color: #c9d1d9;
}

:root.dark .content-inline-code {
  background: rgba(255, 255, 255, 0.09);
  color: #ffb3c8;
}

/* 语法高亮配色（GitHub 风味，亮/暗各一套） */
.content-code .hljs-comment,
.content-code .hljs-quote {
  color: #6e7781;
  font-style: italic;
}

.content-code .hljs-keyword,
.content-code .hljs-selector-tag,
.content-code .hljs-doctag,
.content-code .hljs-formula {
  color: #cf222e;
}

.content-code .hljs-string,
.content-code .hljs-regexp,
.content-code .hljs-addition,
.content-code .hljs-meta .hljs-string {
  color: #0a3069;
}

.content-code .hljs-number,
.content-code .hljs-attr,
.content-code .hljs-attribute,
.content-code .hljs-variable,
.content-code .hljs-template-variable,
.content-code .hljs-type,
.content-code .hljs-literal,
.content-code .hljs-built_in,
.content-code .hljs-symbol,
.content-code .hljs-bullet,
.content-code .hljs-link {
  color: #0550ae;
}

.content-code .hljs-title,
.content-code .hljs-title.class_,
.content-code .hljs-title.function_,
.content-code .hljs-section {
  color: #8250df;
}

.content-code .hljs-tag,
.content-code .hljs-name,
.content-code .hljs-selector-id,
.content-code .hljs-selector-class {
  color: #116329;
}

.content-code .hljs-meta {
  color: #6e7781;
}

.content-code .hljs-emphasis {
  font-style: italic;
}

.content-code .hljs-strong {
  font-weight: 600;
}

:root.dark .content-code .hljs-comment,
:root.dark .content-code .hljs-quote {
  color: #8b949e;
}

:root.dark .content-code .hljs-keyword,
:root.dark .content-code .hljs-selector-tag,
:root.dark .content-code .hljs-doctag,
:root.dark .content-code .hljs-formula {
  color: #ff7b72;
}

:root.dark .content-code .hljs-string,
:root.dark .content-code .hljs-regexp,
:root.dark .content-code .hljs-addition,
:root.dark .content-code .hljs-meta .hljs-string {
  color: #a5d6ff;
}

:root.dark .content-code .hljs-number,
:root.dark .content-code .hljs-attr,
:root.dark .content-code .hljs-attribute,
:root.dark .content-code .hljs-variable,
:root.dark .content-code .hljs-template-variable,
:root.dark .content-code .hljs-type,
:root.dark .content-code .hljs-literal,
:root.dark .content-code .hljs-built_in,
:root.dark .content-code .hljs-symbol,
:root.dark .content-code .hljs-bullet,
:root.dark .content-code .hljs-link {
  color: #79c0ff;
}

:root.dark .content-code .hljs-title,
:root.dark .content-code .hljs-title.class_,
:root.dark .content-code .hljs-title.function_,
:root.dark .content-code .hljs-section {
  color: #d2a8ff;
}

:root.dark .content-code .hljs-tag,
:root.dark .content-code .hljs-name,
:root.dark .content-code .hljs-selector-id,
:root.dark .content-code .hljs-selector-class {
  color: #7ee787;
}

:root.dark .content-code .hljs-meta {
  color: #8b949e;
}
</style>
