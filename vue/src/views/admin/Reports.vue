<template>
  <div class="reports-page">
    <!-- 状态筛选 + 类型筛选 -->
    <div class="reports-toolbar">
      <div class="sort-tabs">
        <button
          v-for="tab in STATUS_TABS"
          :key="tab.value"
          type="button"
          class="sort-tab"
          :class="{ 'is-active': status === tab.value }"
          @click="switchStatus(tab.value)"
        >
          {{ tab.text }}
          <em v-if="tab.value === 0 && pendingCount" class="sort-tab__badge">{{ pendingCount }}</em>
        </button>
      </div>

      <!-- 必须用自绘下拉：原生 <select> 展开的选项列表由系统绘制，样式改不了 -->
      <SelectBox
        v-model="targetType"
        :options="TYPE_OPTIONS"
        align="end"
        @change="reload"
      />
    </div>

    <p class="page-tip">
      受理时可以选择「删除内容」和「处罚作者」（禁言 / 封号）；同一内容上的其他待处理举报会一并结案，
      并分别通知每位举报人处理结果。
    </p>

    <!-- 列表 -->
    <div v-if="loading && !list.length" class="reports-empty">加载中…</div>
    <div v-else-if="!list.length" class="reports-empty">没有符合条件的举报</div>

    <ul v-else class="report-list">
      <li
        v-for="item in list"
        :key="item.id"
        class="report-row"
        :class="{ 'is-pending': item.status === 0 }"
        @click="openDetail(item)"
      >
        <div class="report-row__main">
          <div class="report-row__head">
            <span class="type-chip" :class="`type-chip--${item.targetType}`">
              {{ TYPE_LABEL[item.targetType] || item.targetType }}
            </span>
            <span class="reason-chip">{{ item.reasonLabel }}</span>
            <span class="report-row__summary">{{ item.targetSummary }}</span>
            <span class="status-chip" :class="`status-chip--${item.status}`">
              {{ STATUS_LABEL[item.status] }}
            </span>
          </div>

          <div class="report-row__meta">
            <span>举报人：{{ item.reporterName || "已注销" }}</span>
            <span class="sep">·</span>
            <span>{{ formatAbsoluteTime(item.createdAt) }}</span>
            <template v-if="item.targetAuthorName">
              <span class="sep">·</span>
              <span>作者：{{ item.targetAuthorName }}</span>
            </template>
            <template v-if="item.targetReportCount > 1">
              <span class="sep">·</span>
              <span class="warn-text">该内容累计被举报 {{ item.targetReportCount }} 次</span>
            </template>
            <template v-if="!item.targetExists">
              <span class="sep">·</span>
              <span class="muted">内容已删除</span>
            </template>
          </div>

          <p v-if="item.detail" class="report-row__detail">“{{ item.detail }}”</p>

          <div v-if="item.status !== 0" class="report-row__handled">
            {{ item.handleAction === "accept" ? "已受理" : "已驳回" }}
            <template v-if="item.handlerName"> · {{ item.handlerName }}</template>
            <template v-if="item.handleNote"> · {{ item.handleNote }}</template>
          </div>
        </div>

        <button
          type="button"
          class="admin-btn admin-btn--ghost report-row__btn"
          @click.stop="openDetail(item)"
        >
          {{ item.status === 0 ? "处理" : "查看" }}
        </button>
      </li>
    </ul>

    <div v-if="total > pageSize" class="reports-pager">
      <Pagination v-model="pageNum" :total-items="total" :page-size="pageSize" @change="load" />
    </div>

    <!-- ---------------------------------------------------- 详情 / 处理弹窗 -->
    <Teleport to="body">
      <div v-if="detailVisible" class="detail-overlay" @click.self="closeDetail">
        <div class="detail-card" role="dialog" aria-modal="true">
          <header class="detail-head">
            <h2 class="detail-head__title">
              {{ current?.status === 0 ? "处理举报" : "举报详情" }}
              <span class="detail-head__id">#{{ current?.id }}</span>
            </h2>
            <button type="button" class="detail-head__close" aria-label="关闭" @click="closeDetail">
              <IconClose :size="16" />
            </button>
          </header>

          <div v-if="detailLoading" class="detail-loading">加载中…</div>

          <div v-else-if="detail" class="detail-body">
            <!-- 举报信息 -->
            <section class="detail-block">
              <div class="detail-block__title">举报信息</div>
              <dl class="detail-kv">
                <dt>理由</dt>
                <dd>{{ detail.report.reasonLabel }}</dd>
                <dt>举报人</dt>
                <dd>{{ detail.report.reporterName || "已注销" }}</dd>
                <dt>时间</dt>
                <dd>{{ formatAbsoluteTime(detail.report.createdAt) }}</dd>
                <dt v-if="detail.report.detail">补充说明</dt>
                <dd v-if="detail.report.detail" class="detail-quote">{{ detail.report.detail }}</dd>
              </dl>
            </section>

            <!-- 被举报内容 -->
            <section class="detail-block">
              <div class="detail-block__title">
                被举报内容
                <span class="type-chip" :class="`type-chip--${detail.target.targetType}`">
                  {{ TYPE_LABEL[detail.target.targetType] }}
                </span>
              </div>

              <template v-if="detail.target.exists">
                <div class="target-author">
                  <Avatar :src="detail.target.authorAvatar" :alt="detail.target.authorName" :size="26" />
                  <span class="target-author__name">{{ detail.target.authorName }}</span>
                  <span v-if="detail.target.authorBanned" class="ban-chip">
                    {{ detail.target.authorBanLevel === 1 ? "已禁言" : "已封号" }}{{ banChipSuffix }}
                  </span>
                </div>

                <h3 v-if="detail.target.title" class="target-title">{{ detail.target.title }}</h3>
                <p v-if="detail.target.context" class="target-context">
                  来自帖子：{{ detail.target.context }}
                </p>
                <pre v-if="detail.target.content" class="target-content">{{ detail.target.content }}</pre>
                <img
                  v-if="detail.target.image"
                  class="target-image"
                  :src="detail.target.image"
                  alt="附图"
                />
              </template>

              <div v-else class="target-gone">
                内容已被删除
                <template v-if="detail.target.authorName">
                  （作者：{{ detail.target.authorName }}）
                </template>
              </div>

              <p class="target-stat">
                该内容历史被举报 {{ detail.target.totalReports }} 次，
                其中待处理 {{ detail.target.pendingReports }} 条
              </p>
            </section>

            <!-- 处理区 / 处理结果 -->
            <section v-if="detail.report.status === 0" class="detail-block detail-block--handle">
              <div class="detail-block__title">处理</div>

              <label class="check-row">
                <input v-model="form.deleteContent" type="checkbox" />
                <span>
                  同时删除该内容
                  <em v-if="form.deleteContent" class="danger-text">删除后不可恢复</em>
                </span>
              </label>

              <div class="check-row">
                <input id="ban-toggle" v-model="form.ban" type="checkbox" />
                <label for="ban-toggle">处罚作者</label>
                <!-- 浮层要盖过详情弹窗（3000），所以抬到 3100 -->
                <SelectBox
                  v-if="form.ban"
                  v-model="form.banDays"
                  size="sm"
                  align="start"
                  :panel-z="3100"
                  :options="BAN_DAY_OPTIONS"
                />
              </div>

              <!-- 处罚力度：禁言只断发言，封号连登录一起断 -->
              <div v-if="form.ban" class="punish-level" role="radiogroup" aria-label="处罚方式">
                <button
                  v-for="opt in PUNISH_LEVELS"
                  :key="opt.level"
                  type="button"
                  class="punish-level__item"
                  :class="{ 'is-on': form.banLevel === opt.level }"
                  role="radio"
                  :aria-checked="form.banLevel === opt.level"
                  @click="form.banLevel = opt.level"
                >
                  <span class="punish-level__name">{{ opt.name }}</span>
                  <span class="punish-level__desc">{{ opt.desc }}</span>
                </button>
              </div>

              <input
                v-if="form.ban"
                v-model="form.banReason"
                class="detail-input"
                type="text"
                maxlength="200"
                :placeholder="`${form.banLevel === 1 ? '禁言' : '封号'}理由（本人会看到，留空则自动填写）`"
              />

              <textarea
                v-model="form.note"
                class="detail-textarea"
                rows="2"
                maxlength="500"
                placeholder="处理备注（会展示给举报人）"
              ></textarea>

              <p class="handle-tip">
                受理后会给举报人发一条站内通知；同一内容上其他待处理的举报会一并结案。
              </p>
            </section>

            <section v-else class="detail-block">
              <div class="detail-block__title">处理结果</div>
              <dl class="detail-kv">
                <dt>结论</dt>
                <dd>{{ detail.report.handleAction === "accept" ? "已受理" : "已驳回" }}</dd>
                <dt>处理人</dt>
                <dd>{{ detail.report.handlerName || "—" }}</dd>
                <dt>时间</dt>
                <dd>{{ formatAbsoluteTime(detail.report.handleTime) }}</dd>
                <dt v-if="detail.report.handleNote">备注</dt>
                <dd v-if="detail.report.handleNote" class="detail-quote">{{ detail.report.handleNote }}</dd>
              </dl>
            </section>
          </div>

          <footer class="detail-foot">
            <Button class="detail-btn" type="default" @click="closeDetail">关闭</Button>
            <template v-if="detail?.report?.status === 0">
              <Button
                class="detail-btn"
                type="default"
                :disabled="submitting"
                @click="submitHandle('reject')"
              >
                驳回
              </Button>
              <Button
                class="detail-btn detail-btn--primary"
                type="bilibili"
                :disabled="submitting"
                @click="submitHandle('accept')"
              >
                {{ submitting ? "处理中…" : "受理" }}
              </Button>
            </template>
          </footer>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessageBox } from "element-plus";
import Avatar from "@/components/modules/Avatar.vue";
import Button from "@/components/buttons/Button.vue";
import IconClose from "@/components/icons/IconClose.vue";
import SelectBox from "@/components/inputs/SelectBox.vue";
import Pagination from "@/components/modules/Pagination.vue";
import { getReportDetail, getReportList, handleReport } from "@/api/reports";
import { formatAbsoluteTime, formatFullDateTime } from "@/utils/time";
import { message } from "@/utils/message";

const STATUS_TABS = [
  { value: 0, text: "待处理" },
  { value: 1, text: "已受理" },
  { value: 2, text: "已驳回" },
  { value: -1, text: "全部" },
];

const STATUS_LABEL = { 0: "待处理", 1: "已受理", 2: "已驳回" };
const TYPE_LABEL = { post: "帖子", comment: "评论", user: "用户" };
const TYPE_OPTIONS = [
  { value: "", label: "全部类型" },
  { value: "post", label: "帖子" },
  { value: "comment", label: "评论" },
  { value: "user", label: "用户" },
];
// 处罚天数：-1 = 永久（后端 HandleReportDTO.days）
const BAN_DAY_OPTIONS = [
  { value: 1, label: "1 天" },
  { value: 3, label: "3 天" },
  { value: 7, label: "7 天" },
  { value: 30, label: "30 天" },
  { value: -1, label: "永久" },
];

const status = ref(0);
const targetType = ref("");
const list = ref([]);
const total = ref(0);
const pageNum = ref(1);
const pageSize = 10;
const loading = ref(false);

// 「已受理 / 已驳回」两个 tab 各查一次就能算出待处理数量，
// 这里单独用一个计数接口，切换 tab 时不用把所有数据都拉下来
const pendingCount = ref(0);

const detailVisible = ref(false);
const detailLoading = ref(false);
const detail = ref(null);
const current = ref(null);
const submitting = ref(false);

const form = reactive({
  deleteContent: false,
  ban: false,
  banLevel: 2,
  banDays: 7,
  banReason: "",
  note: "",
});

/** 处罚力度。默认封号，和改造前「勾了就是封禁」的行为保持一致 */
const PUNISH_LEVELS = [
  { level: 1, name: "禁言", desc: "能登录，不能发帖评论" },
  { level: 2, name: "封号", desc: "不能登录" },
];

/** 作者已有处罚时，chip 后面补的「（期限）理由」 */
const banChipSuffix = computed(() => {
  const t = detail.value?.target;
  if (!t) return "";
  const until = t.authorBanUntil ? formatFullDateTime(t.authorBanUntil).slice(0, 16) : "永久";
  const reason = t.authorBanReason ? `：${t.authorBanReason}` : "";
  return `（${until}）${reason}`;
});

const queryParams = computed(() => ({
  pageNum: pageNum.value,
  pageSize,
  // -1 是我们自己的「全部」，后端不传 status 即全部
  status: status.value === -1 ? undefined : status.value,
  targetType: targetType.value || undefined,
}));

async function load() {
  if (loading.value) return;
  loading.value = true;
  try {
    const res = await getReportList(queryParams.value);
    if (res.code === 200) {
      list.value = res.data?.list || [];
      total.value = res.data?.total || 0;
    } else {
      message(res.msg || "加载失败", "error");
    }
  } catch (err) {
    message(err?.msg || "网络异常，请稍后重试", "error");
  } finally {
    loading.value = false;
  }
}

async function loadPendingCount() {
  try {
    // 借列表接口的 total 拿待处理数量，省一个专门接口
    const res = await getReportList({ pageNum: 1, pageSize: 1, status: 0 });
    if (res.code === 200) pendingCount.value = res.data?.total || 0;
  } catch {
    // 徽标数字失败不影响主流程
  }
}

function reload() {
  pageNum.value = 1;
  load();
}

function switchStatus(v) {
  if (status.value === v) return;
  status.value = v;
  reload();
}

async function openDetail(item) {
  current.value = item;
  detail.value = null;
  detailVisible.value = true;
  detailLoading.value = true;

  // 每次打开都把处理表单恢复默认，避免上一条的勾选残留
  form.deleteContent = false;
  form.ban = false;
  form.banLevel = 2;
  form.banDays = 7;
  form.banReason = "";
  form.note = "";

  try {
    const res = await getReportDetail(item.id);
    if (res.code === 200) {
      detail.value = res.data;
      current.value = res.data.report;
    } else {
      message(res.msg || "加载详情失败", "error");
      closeDetail();
    }
  } catch (err) {
    message(err?.msg || "网络异常", "error");
    closeDetail();
  } finally {
    detailLoading.value = false;
  }
}

function closeDetail() {
  if (submitting.value) return;
  detailVisible.value = false;
  detail.value = null;
  current.value = null;
}

async function submitHandle(action) {
  if (!current.value || submitting.value) return;

  // 举报人就是被处理的作者时，「删除内容」会顺带把举报人的东西删掉，
  // 这里不额外拦，但永久处罚这种重操作再确认一次
  if (action === "accept" && form.ban && form.banDays === -1) {
    const ok = await confirmPermanentBan();
    if (!ok) return;
  }

  submitting.value = true;
  try {
    const res = await handleReport(current.value.id, {
      action,
      deleteContent: action === "accept" ? form.deleteContent : false,
      banType: action === "accept" && form.ban && form.banLevel === 1 ? "mute" : "ban",
      banDays: action === "accept" && form.ban ? form.banDays : 0,
      banReason: form.ban ? form.banReason.trim() || undefined : undefined,
      note: form.note.trim() || undefined,
    });
    if (res.code === 200) {
      message(res.msg || "已处理", "success");
      // 先解除提交中的锁再关弹窗：closeDetail 会因为 submitting=true 直接 return，
      // 结果就是「处理成功了但弹窗关不掉」（这个坑踩过一次）
      submitting.value = false;
      closeDetail();
      load();
      loadPendingCount();
    } else {
      message(res.msg || "处理失败", "error");
    }
  } catch (err) {
    message(err?.msg || "网络异常，请稍后重试", "error");
  } finally {
    submitting.value = false;
  }
}

/**
 * 永久处罚没有到期时间，只能手动撤销，所以再确认一次。
 * 用站内 ElMessageBox（而不是 window.confirm）：原生确认框在暗色主题下
 * 是白底黑字的小方块，和后台的圆角卡片完全不是一套东西。
 * 返回 true 表示确认继续。
 */
async function confirmPermanentBan() {
  const what = form.banLevel === 1 ? "禁言" : "封号";
  const effect = form.banLevel === 1
    ? "对方能登录，但永远发不了内容"
    : "对方将无法再登录";
  try {
    await ElMessageBox.confirm(
      `永久${what}只能手动撤销，${effect}。确定继续吗？`,
      `永久${what}`,
      {
        type: "warning",
        confirmButtonText: `永久${what}`,
        cancelButtonText: "取消",
        customClass: "danger-confirm",
      }
    );
    return true;
  } catch {
    return false; // 用户取消
  }
}

onMounted(() => {
  load();
  loadPendingCount();
});
</script>

<style scoped>
.reports-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.reports-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

/* 分段控件：与前台 .sort-tabs 同一套语言 */
.sort-tabs {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px;
  border-radius: 10px;
  background: var(--bg-nomarl);
}

.sort-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 14px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.83rem;
  cursor: pointer;
  transition:
    background 0.18s,
    color 0.18s;
}

.sort-tab:hover {
  color: var(--text-primary);
}

.sort-tab.is-active {
  background: var(--bg-primary);
  color: var(--text-primary);
  font-weight: 500;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.sort-tab__badge {
  min-width: 17px;
  height: 17px;
  padding: 0 5px;
  border-radius: 9px;
  background: #fb7299;
  color: #fff;
  font-size: 0.68rem;
  font-style: normal;
  line-height: 17px;
  text-align: center;
}

/* 下拉选择器统一用 components/inputs/SelectBox.vue（自绘浮层），
   原生 <select> 的展开列表是系统绘制的，样式改不了，别再写回来 */

.page-tip {
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.6;
  color: var(--text-secondary);
}

.reports-empty {
  padding: 48px 0;
  text-align: center;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.report-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.report-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-primary);
  cursor: pointer;
  transition:
    border-color 0.18s,
    background 0.18s;
}

.report-row:hover {
  border-color: var(--primary-color);
}

/* 待处理的左边带一条粉色，一眼扫出队列 */
.report-row.is-pending {
  border-left: 3px solid #fb7299;
}

.report-row__main {
  flex: 1;
  min-width: 0;
}

.report-row__head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.report-row__summary {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 380px;
  font-size: 0.86rem;
  color: var(--text-primary);
}

.report-row__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-size: 0.76rem;
  color: var(--text-secondary);
}

.report-row__meta .sep {
  opacity: 0.5;
}

.warn-text {
  color: #f59e0b;
}

.muted {
  opacity: 0.7;
}

.report-row__detail {
  margin: 6px 0 0;
  font-size: 0.78rem;
  color: var(--text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.report-row__handled {
  margin-top: 6px;
  font-size: 0.76rem;
  color: var(--text-secondary);
  opacity: 0.85;
}

.report-row__btn {
  flex-shrink: 0;
}

.type-chip,
.reason-chip,
.status-chip,
.ban-chip {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 8px;
  border-radius: 6px;
  font-size: 0.72rem;
  line-height: 1;
  white-space: nowrap;
}

.type-chip {
  background: var(--bg-nomarl);
  color: var(--text-secondary);
}

.type-chip--post {
  color: var(--primary-color);
  background: var(--primary-color-soft);
}

.type-chip--comment {
  color: #8b5cf6;
  background: rgba(139, 92, 246, 0.12);
}

.type-chip--user {
  color: #10b981;
  background: rgba(16, 185, 129, 0.12);
}

.reason-chip {
  background: rgba(251, 114, 153, 0.12);
  color: #fb7299;
}

.status-chip--0 {
  background: rgba(251, 114, 153, 0.16);
  color: #fb7299;
  font-weight: 500;
}

.status-chip--1 {
  background: rgba(16, 185, 129, 0.14);
  color: #10b981;
}

.status-chip--2 {
  background: var(--bg-nomarl);
  color: var(--text-secondary);
}

.ban-chip {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
}

.reports-pager {
  display: flex;
  justify-content: center;
  padding: 6px 0 2px;
}

/* ---------------- 详情弹窗 ---------------- */
.detail-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.42);
  backdrop-filter: blur(3px);
}

.detail-card {
  display: flex;
  flex-direction: column;
  width: 620px;
  max-width: 100%;
  max-height: calc(100vh - 40px);
  border-radius: 16px;
  background: var(--bg-primary);
  color: var(--text-primary);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.24);
  overflow: hidden;
}

.detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
}

.detail-head__title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.detail-head__id {
  font-size: 0.76rem;
  font-weight: 400;
  color: var(--text-secondary);
}

.detail-head__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.detail-head__close:hover {
  background: var(--bg-hover);
}

.detail-loading {
  padding: 40px 0;
  text-align: center;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.detail-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.detail-block + .detail-block {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
}

.detail-block__title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 0.86rem;
  font-weight: 600;
}

.detail-kv {
  display: grid;
  grid-template-columns: 68px 1fr;
  gap: 8px 10px;
  margin: 0;
  font-size: 0.82rem;
}

.detail-kv dt {
  color: var(--text-secondary);
}

.detail-kv dd {
  margin: 0;
  word-break: break-word;
}

.detail-quote {
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--bg-secondary);
  line-height: 1.6;
}

.target-author {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.target-author__name {
  font-size: 0.82rem;
  color: var(--text-secondary);
}

.target-title {
  margin: 0 0 6px;
  font-size: 0.95rem;
  font-weight: 600;
}

.target-context {
  margin: 0 0 8px;
  font-size: 0.76rem;
  color: var(--text-secondary);
}

.target-content {
  max-height: 240px;
  margin: 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.82rem;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-y: auto;
}

.target-image {
  display: block;
  max-width: 100%;
  max-height: 200px;
  margin-top: 10px;
  border-radius: 8px;
  object-fit: contain;
}

.target-gone {
  padding: 14px 12px;
  border-radius: 10px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 0.82rem;
  text-align: center;
}

.target-stat {
  margin: 10px 0 0;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.check-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 0.83rem;
  cursor: pointer;
}

.check-row input[type="checkbox"] {
  width: 15px;
  height: 15px;
  accent-color: var(--primary-color);
  cursor: pointer;
}

.danger-text {
  margin-left: 6px;
  color: #ef4444;
  font-size: 0.74rem;
  font-style: normal;
}

/*
 * 处罚力度二选一。
 * 沿用站内分段控件的语言：底盘 --bg-nomarl + 3px 内衬 + 10px 圆角，
 * 选中项换 --bg-primary 并加一道浅阴影。
 */
.punish-level {
  display: flex;
  gap: 3px;
  margin: 0 0 10px;
  padding: 3px;
  border-radius: 10px;
  background: var(--bg-nomarl);
}

.punish-level__item {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 7px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.punish-level__item:hover {
  color: var(--text-primary);
}

.punish-level__item.is-on {
  background: var(--bg-primary);
  color: var(--text-primary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.punish-level__name {
  font-size: 0.83rem;
  font-weight: 600;
}

.punish-level__desc {
  font-size: 0.72rem;
  color: var(--text-secondary);
}

/* 暗色下 --bg-primary 比底盘更深，选中项会显得凹陷 → 换成一层浅白 */
:global(:root.dark .punish-level__item.is-on) {
  background: rgba(255, 255, 255, 0.09);
  box-shadow: none;
}

.detail-input,
.detail-textarea {
  display: block;
  width: 100%;
  box-sizing: border-box;
  margin-bottom: 10px;
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.82rem;
  line-height: 1.6;
}

.detail-input:focus,
.detail-textarea:focus {
  outline: none;
  border-color: var(--primary-color);
}

.detail-textarea {
  resize: vertical;
}

.handle-tip {
  margin: 0;
  font-size: 0.75rem;
  line-height: 1.6;
  color: var(--text-secondary);
}

.detail-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--border-color);
}

/* Button.vue 只有配色，尺寸必须由使用处提供 */
.detail-btn {
  height: 32px;
  padding: 0 16px;
  border-radius: 8px;
  font-size: 0.83rem;
}

.detail-btn--primary {
  min-width: 76px;
}

/* default 类型在暗色下是一块浅灰实底，这里换成描边（与后台其它次级按钮一致） */
:global(:root.dark .detail-btn:not(.detail-btn--primary)) {
  --bg-color: transparent;
  --text-color: var(--text-primary);
  --hover-bg-color: var(--bg-hover);
  --hover-text-color: var(--text-primary);
  border: 1px solid var(--border-color);
}

@media (max-width: 640px) {
  .detail-overlay {
    padding: 10px;
  }

  .detail-card {
    max-height: calc(100vh - 20px);
  }

  .report-row__summary {
    max-width: 100%;
  }

  .reports-toolbar {
    align-items: flex-start;
  }
}
</style>
