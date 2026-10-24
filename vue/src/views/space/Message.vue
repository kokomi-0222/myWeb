<template>
  <div class="message-page">
    <!-- 头部：标题 + 未读 + 全部已读 -->
    <div class="message-head">
      <div class="message-head__left">
        <h2 class="message-head__title">消息中心</h2>
        <span v-if="unreadCount" class="message-head__badge">{{ unreadCount }} 条未读</span>
      </div>
      <button
        v-if="unreadCount > 0"
        type="button"
        class="message-head__action"
        :disabled="marking"
        @click="handleMarkAll"
      >
        {{ marking ? "处理中…" : "全部已读" }}
      </button>
    </div>

    <!-- 骨架 -->
    <template v-if="loading && list.length === 0">
      <div v-for="n in 3" :key="'sk-' + n" class="msg-skeleton">
        <div class="msg-skeleton__avatar"></div>
        <div class="msg-skeleton__lines">
          <div class="msg-skeleton__line" style="width: 40%"></div>
          <div class="msg-skeleton__line" style="width: 78%"></div>
        </div>
      </div>
    </template>

    <!-- 列表 -->
    <ul v-else-if="list.length > 0" class="msg-list">
      <li
        v-for="item in list"
        :key="item.id"
        class="msg-item"
        :class="{ 'is-unread': !item.isRead }"
        @click="handleOpen(item)"
      >
        <span class="msg-item__avatar" @click.stop="goUser(item.senderId)">
          <Avatar :src="item.senderAvatar" :alt="item.senderName" :size="44" />
        </span>

        <div class="msg-item__body">
          <div class="msg-item__top">
            <span class="msg-item__name" @click.stop="goUser(item.senderId)">
              {{ item.senderName || "某位用户" }}
            </span>
            <span class="msg-item__type" :class="`msg-item__type--${item.type}`">
              {{ typeLabel(item.type) }}
            </span>
            <time class="msg-item__time">{{ formatRelativeTime(item.createdAt) }}</time>
          </div>
          <p class="msg-item__text">{{ item.content }}</p>
        </div>

        <span v-if="!item.isRead" class="msg-item__dot" aria-label="未读"></span>
      </li>
    </ul>

    <!-- 空状态 -->
    <div v-else-if="!loading" class="empty-state">
      <div class="empty-state__icon"><IconMessage :size="40" /></div>
      <p class="empty-state__title">还没有收到消息</p>
      <p class="empty-state__desc">有人点赞、评论或回复你时，会出现在这里</p>
    </div>

    <!-- 加载更多 -->
    <div v-if="list.length > 0 && list.length < total" class="msg-more">
      <button type="button" class="msg-more__btn" :disabled="loading" @click="loadMore">
        {{ loading ? "加载中…" : "加载更多" }}
      </button>
    </div>
    <div v-else-if="list.length > 0" class="msg-end">已经全部看完啦</div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import IconMessage from "@/components/icons/IconMessage.vue";
import { getNotifications, markAllRead, markRead } from "@/api/notification";
import { useNotificationStore } from "@/stores/notification";
import { formatRelativeTime } from "@/utils/time";
import message from "@/utils/message";

const router = useRouter();
const notifyStore = useNotificationStore();

const list = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const loading = ref(false);
const marking = ref(false);

const unreadCount = computed(() => notifyStore.unread);

const TYPE_LABEL = {
  like_post: "赞了帖子",
  like_comment: "赞了评论",
  comment: "评论",
  reply: "回复",
  forward: "转发",
  report_result: "举报结果",
};

function typeLabel(type) {
  return TYPE_LABEL[type] || "通知";
}

async function load(reset = false) {
  if (loading.value) return;
  loading.value = true;
  try {
    const target = reset ? 1 : page.value;
    const res = await getNotifications(target, pageSize);
    if (res.code === 200) {
      const rows = res.data?.list || [];
      list.value = reset ? rows : [...list.value, ...rows];
      total.value = res.data?.total || 0;
      page.value = target;
    }
  } catch (err) {
    console.error("加载通知失败:", err);
  } finally {
    loading.value = false;
  }
}

function loadMore() {
  page.value += 1;
  load();
}

async function handleOpen(item) {
  // 先本地标记，红点立刻减一，不用等接口
  if (!item.isRead) {
    item.isRead = true;
    notifyStore.setUnread(Math.max(0, notifyStore.unread - 1));
    try {
      await markRead(item.id);
    } catch (err) {
      console.warn("标记已读失败:", err);
    }
  }
  if (item.postId) {
    router.push(`/post/${item.postId}`);
  }
}

async function handleMarkAll() {
  if (marking.value) return;
  marking.value = true;
  try {
    const res = await markAllRead();
    if (res.code === 200) {
      list.value = list.value.map((it) => ({ ...it, isRead: true }));
      notifyStore.setUnread(0);
      message.success("已全部标记为已读");
    }
  } catch (err) {
    console.error("全部已读失败:", err);
  } finally {
    marking.value = false;
  }
}

function goUser(id) {
  if (!id) return;
  router.push(`/user/${id}`);
}

onMounted(() => {
  load(true);
  notifyStore.fetchUnread();
});
</script>

<style scoped>
.message-page {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px 24px 24px;
}

/* ---------- 头部 ---------- */
.message-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border-color);
}

.message-head__left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.message-head__title {
  margin: 0;
  font-size: 1.0625rem;
  font-weight: 600;
  color: var(--text-primary);
}

.message-head__badge {
  font-size: 0.75rem;
  font-weight: 600;
  color: #fb7299;
  background: rgba(251, 114, 153, 0.12);
  padding: 2px 9px;
  border-radius: 10px;
  white-space: nowrap;
}

.message-head__action {
  flex-shrink: 0;
  font-size: 0.8125rem;
  color: var(--primary-color);
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 5px 12px;
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease;
}

.message-head__action:hover:not(:disabled) {
  background: var(--bg-nomarl);
  border-color: var(--primary-color);
}

.message-head__action:disabled {
  opacity: 0.6;
  cursor: default;
}

/* ---------- 列表 ---------- */
.msg-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.msg-item {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 10px;
  margin: 0 -10px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.18s ease;
}

.msg-item + .msg-item {
  border-top: 1px solid var(--border-color);
}

.msg-item:hover {
  background: var(--bg-nomarl);
}

.msg-item.is-unread {
  background: rgba(0, 174, 236, 0.04);
}

.msg-item__avatar {
  flex-shrink: 0;
  display: inline-flex;
  cursor: pointer;
  border-radius: 50%;
}

.msg-item__body {
  flex: 1;
  min-width: 0;
}

.msg-item__top {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.msg-item__name {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
  cursor: pointer;
}

.msg-item__name:hover {
  color: var(--primary-color);
}

.msg-item__type {
  font-size: 0.6875rem;
  padding: 1px 7px;
  border-radius: 8px;
  background: var(--bg-nomarl);
  color: var(--text-secondary);
  white-space: nowrap;
}

.msg-item__type--like_post,
.msg-item__type--like_comment {
  color: #fb7299;
  background: rgba(251, 114, 153, 0.12);
}

.msg-item__type--comment,
.msg-item__type--reply {
  color: var(--primary-color);
  background: rgba(0, 174, 236, 0.12);
}

.msg-item__type--forward {
  color: #8b5cf6;
  background: rgba(139, 92, 246, 0.12);
}

.msg-item__type--report_result {
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.14);
}

.msg-item__time {
  margin-left: auto;
  font-size: 0.75rem;
  color: var(--text-secondary);
  white-space: nowrap;
}

.msg-item__text {
  margin: 6px 0 0;
  font-size: 0.8125rem;
  line-height: 1.6;
  color: var(--text-secondary);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow-wrap: break-word;
}

.msg-item__dot {
  position: absolute;
  top: 18px;
  right: 4px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #fb7299;
}

/* ---------- 骨架 / 空状态 / 加载更多 ---------- */
.msg-skeleton {
  display: flex;
  gap: 12px;
  padding: 14px 0;
}

.msg-skeleton__avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--bg-nomarl);
  flex-shrink: 0;
}

.msg-skeleton__lines {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 6px;
}

.msg-skeleton__line {
  height: 11px;
  border-radius: 6px;
  background: var(--bg-nomarl);
}

.empty-state {
  text-align: center;
  padding: 64px 20px;
}

.empty-state__icon {
  color: var(--text-secondary);
  display: flex;
  justify-content: center;
  margin-bottom: 12px;
}

.empty-state__title {
  margin: 0 0 6px;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.empty-state__desc {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.msg-more {
  display: flex;
  justify-content: center;
  padding-top: 18px;
}

.msg-more__btn {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 6px 18px;
  cursor: pointer;
}

.msg-more__btn:hover:not(:disabled) {
  color: var(--primary-color);
  border-color: var(--primary-color);
}

.msg-end {
  text-align: center;
  font-size: 0.75rem;
  color: var(--text-secondary);
  padding-top: 20px;
  opacity: 0.75;
}

@media (max-width: 767px) {
  .message-page {
    padding: 16px 14px 20px;
  }

  .msg-item__time {
    margin-left: 0;
  }
}
</style>
