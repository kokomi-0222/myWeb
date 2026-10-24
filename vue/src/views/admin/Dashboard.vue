<template>
  <div class="dash">
    <!-- 四个统计卡片 -->
    <section class="stat-grid">
      <div v-for="card in cards" :key="card.key" class="stat-card">
        <span class="stat-card__bar" :style="{ background: card.color }"></span>
        <div class="stat-card__body">
          <span class="stat-card__label">{{ card.label }}</span>
          <strong class="stat-card__value">
            {{ loading ? "—" : formatNumber(card.value) }}
          </strong>
          <span class="stat-card__today">
            <template v-if="card.today !== null">
              今日 <b :style="{ color: card.color }">+{{ loading ? 0 : card.today }}</b>
            </template>
            <template v-else>发布框里可选的分类</template>
          </span>
        </div>
      </div>
    </section>

    <div class="panel-grid">
      <!-- 最近注册 -->
      <section class="panel">
        <header class="panel__head">
          <h2 class="panel__title">最近注册</h2>
          <RouterLink class="panel__link" to="/admin/users">全部用户</RouterLink>
        </header>

        <ul v-if="recentUsers.length" class="plain-list">
          <li v-for="u in recentUsers" :key="u.id" class="plain-row">
            <Avatar :src="u.avatar" :alt="u.name" :size="32" />
            <div class="plain-row__main">
              <span class="plain-row__title">{{ u.name || u.username || "未命名" }}</span>
              <span class="plain-row__sub">#{{ u.id }} · {{ timeAgo(u.createTime) }}</span>
            </div>
            <span class="plain-row__tag">{{ roleLabel(u.primaryRole) }}</span>
          </li>
        </ul>
        <p v-else class="panel__empty">{{ loading ? "加载中…" : "还没有用户" }}</p>
      </section>

      <!-- 最新帖子 -->
      <section class="panel">
        <header class="panel__head">
          <h2 class="panel__title">最新帖子</h2>
          <RouterLink class="panel__link" to="/">去前台看看</RouterLink>
        </header>

        <ul v-if="recentPosts.length" class="plain-list">
          <li v-for="p in recentPosts" :key="p.id" class="plain-row">
            <RouterLink :to="`/post/${p.id}`" class="plain-row__main plain-row__main--link">
              <span class="plain-row__title plain-row__title--ellipsis">{{ p.title || "（无标题）" }}</span>
              <span class="plain-row__sub">
                {{ p.authorName || "匿名" }} · {{ timeAgo(p.createTime) }} ·
                {{ p.views || 0 }} 阅读
              </span>
            </RouterLink>
            <span v-if="p.type" class="plain-row__tag">{{ typeLabel(p.type) }}</span>
          </li>
        </ul>
        <p v-else class="panel__empty">{{ loading ? "加载中…" : "还没有帖子" }}</p>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { getAdminStats } from "@/api/admin";
import { useTopicStore } from "@/stores/topic";
import { roleLabelOf } from "@/utils/roleTag";

const topicStore = useTopicStore();

const loading = ref(true);
const stats = ref({});

const cards = computed(() => [
  { key: "user", label: "用户总数", value: stats.value.userCount, today: stats.value.todayUserCount, color: "#00aeec" },
  { key: "post", label: "帖子总数", value: stats.value.postCount, today: stats.value.todayPostCount, color: "#fb7299" },
  { key: "comment", label: "评论总数", value: stats.value.commentCount, today: stats.value.todayCommentCount, color: "#23c343" },
  { key: "topic", label: "话题总数", value: stats.value.topicCount, today: null, color: "#f5a623" },
]);

const recentUsers = computed(() => stats.value.recentUsers || []);
const recentPosts = computed(() => stats.value.recentPosts || []);

// 角色名走全局字典（后台改名/自建角色都能正确显示），拿不到才退回编码
const roleLabel = (code) => (code ? roleLabelOf(code) : "普通用户");

// 话题 value → 展示名，直接借用全局话题字典（同一次会话里多半已经加载过）
const typeLabel = (value) => topicStore.labelOf(value);

const formatNumber = (n) => Number(n || 0).toLocaleString("zh-CN");

/** 相对时间：后台列表用它比 2026-10-23 15:03 更好读 */
const timeAgo = (input) => {
  if (!input) return "—";
  // 后端返回 LocalDateTime，形如 2026-10-23T15:03:11；Safari 不认带 T 的写法要走 replace
  const time = new Date(String(input).replace(" ", "T")).getTime();
  if (Number.isNaN(time)) return String(input);
  const diff = Date.now() - time;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

onMounted(async () => {
  try {
    const res = await getAdminStats();
    stats.value = res.data || {};
  } catch {
    stats.value = {};
  } finally {
    loading.value = false;
  }
  // 话题名要用来翻译帖子标签，没加载过就补一次（store 内部有缓存，不会重复请求）
  topicStore.loadTopics();
});
</script>

<style scoped>
.dash {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 1180px;
}

/* ---------------- 统计卡片 ---------------- */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.stat-card {
  position: relative;
  display: flex;
  overflow: hidden;
  padding: 16px 16px 15px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  transition: border-color 0.15s ease, transform 0.15s ease;
}

.stat-card:hover {
  border-color: var(--border-color-hover);
  transform: translateY(-1px);
}

.stat-card__bar {
  position: absolute;
  left: 0;
  top: 14px;
  bottom: 14px;
  width: 3px;
  border-radius: 0 2px 2px 0;
}

.stat-card__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-left: 9px;
  min-width: 0;
}

.stat-card__label {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.stat-card__value {
  font-size: 1.6rem;
  font-weight: 700;
  line-height: 1.15;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.stat-card__today {
  font-size: 0.6875rem;
  color: var(--text-secondary);
}

.stat-card__today b {
  font-weight: 600;
}

/* ---------------- 面板 ---------------- */
.panel-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.panel {
  display: flex;
  flex-direction: column;
  padding: 16px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  min-width: 0;
}

.panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 12px;
  margin-bottom: 4px;
  border-bottom: 1px solid var(--border-color);
}

.panel__title {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--text-primary);
}

.panel__link {
  font-size: 0.75rem;
  color: var(--text-secondary);
  text-decoration: none;
  transition: color 0.15s ease;
}

.panel__link:hover {
  color: var(--primary-color);
}

.panel__empty {
  margin: 22px 0;
  text-align: center;
  font-size: 0.8125rem;
  color: var(--text-secondary);
}

/* ---------------- 列表 ---------------- */
.plain-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.plain-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 4px;
  border-radius: 9px;
  min-width: 0;
}

.plain-row + .plain-row {
  border-top: 1px solid var(--border-color);
}

.plain-row__main {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
  text-decoration: none;
}

.plain-row__main--link:hover .plain-row__title {
  color: var(--primary-color);
}

.plain-row__title {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-primary);
  transition: color 0.15s ease;
}

.plain-row__title--ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plain-row__sub {
  font-size: 0.6875rem;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plain-row__tag {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 7px;
  background: var(--bg-nomarl);
  color: var(--text-secondary);
  font-size: 0.6875rem;
  max-width: 92px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---------------- 响应式 ---------------- */
@media (max-width: 1100px) {
  .stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 860px) {
  .panel-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 520px) {
  .stat-grid {
    gap: 8px;
  }

  .stat-card {
    padding: 13px 12px;
  }

  .stat-card__value {
    font-size: 1.35rem;
  }
}
</style>
