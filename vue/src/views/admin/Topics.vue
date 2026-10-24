<template>
  <div class="topics-page">
    <!-- 新建 -->
    <section class="create-bar">
      <div class="create-bar__left">
        <input
          v-model="newName"
          class="create-bar__input"
          type="text"
          maxlength="20"
          placeholder="输入新话题名称，例如「读书」"
          @keyup.enter="handleCreate"
        />
        <label class="create-bar__color" title="不选则按名称自动配色">
          <span
            class="swatch"
            :class="{ 'swatch--auto': !newColor }"
            :style="newColor ? { backgroundColor: newColor } : null"
          ></span>
          <span class="create-bar__color-text">{{ newColor ? "自定义" : "自动配色" }}</span>
          <input v-model="newColor" type="color" class="color-input" />
        </label>
        <button
          v-if="newColor"
          type="button"
          class="create-bar__reset"
          title="改为自动配色"
          @click="newColor = ''"
        >
          自动
        </button>
      </div>
      <button
        type="button"
        class="btn btn--primary"
        :disabled="creating || !newName.trim()"
        @click="handleCreate"
      >
        {{ creating ? "创建中…" : "新建话题" }}
      </button>
    </section>

    <p class="page-tip">
      话题的排序值和颜色都可以改；话题下还有帖子时不能删除，需要先把那些帖子改成别的话题。
    </p>

    <!-- 列表 -->
    <section class="topic-panel">
      <header class="topic-head">
        <span class="topic-head__col topic-head__col--name">话题</span>
        <span class="topic-head__col topic-head__col--value">存储值</span>
        <span class="topic-head__col topic-head__col--count">帖子</span>
        <span class="topic-head__col topic-head__col--sort">排序</span>
        <span class="topic-head__col topic-head__col--ops">操作</span>
      </header>

      <ul v-if="topics.length" class="topic-list">
        <li v-for="t in topics" :key="t.id ?? t.value" class="topic-row">
          <!-- 编辑态 -->
          <template v-if="editingId === t.id && t.registered">
            <div class="topic-row__name">
              <label class="swatch-wrap" title="点一下改颜色">
                <span class="swatch" :style="{ backgroundColor: editForm.color }"></span>
                <input v-model="editForm.color" type="color" class="color-input" />
              </label>
              <input
                v-model="editForm.name"
                class="inline-input"
                type="text"
                maxlength="20"
                @keyup.enter="saveEdit(t)"
              />
            </div>
            <span class="topic-row__cell topic-row__cell--value">{{ t.value }}</span>
            <span class="topic-row__cell">{{ t.count }}</span>
            <div class="topic-row__cell">
              <input v-model.number="editForm.sort" class="inline-input inline-input--num" type="number" />
            </div>
            <div class="topic-row__ops">
              <button type="button" class="btn btn--primary btn--sm" :disabled="saving" @click="saveEdit(t)">
                {{ saving ? "保存中…" : "保存" }}
              </button>
              <button type="button" class="btn btn--sm" @click="cancelEdit">取消</button>
            </div>
          </template>

          <!-- 展示态 -->
          <template v-else>
            <div class="topic-row__name">
              <span class="dot" :style="{ background: t.color }"></span>
              <span class="topic-row__title">{{ t.name }}</span>
              <span v-if="!t.registered" class="tag tag--warn">未登记</span>
            </div>
            <span class="topic-row__cell topic-row__cell--value">{{ t.value }}</span>
            <span class="topic-row__cell">{{ t.count }}</span>
            <span class="topic-row__cell">{{ t.registered ? t.sort : "—" }}</span>
            <div class="topic-row__ops">
              <template v-if="t.registered">
                <button type="button" class="btn btn--sm" @click="startEdit(t)">编辑</button>
                <button
                  type="button"
                  class="btn btn--sm btn--danger"
                  :disabled="Number(t.count) > 0"
                  :title="Number(t.count) > 0 ? '话题下还有帖子，不能删除' : ''"
                  @click="handleDelete(t)"
                >
                  删除
                </button>
              </template>
              <button v-else type="button" class="btn btn--sm" @click="handleRegister(t)">
                登记
              </button>
            </div>
          </template>
        </li>
      </ul>

      <p v-else class="topic-empty">{{ loading ? "加载中…" : "还没有话题" }}</p>
    </section>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { ElMessageBox } from "element-plus";
import {
  getAdminTopics,
  createAdminTopic,
  updateAdminTopic,
  deleteAdminTopic,
} from "@/api/admin";
import { useTopicStore } from "@/stores/topic";
import message from "@/utils/message";

const topicStore = useTopicStore();

const topics = ref([]);
const loading = ref(false);

const newName = ref("");
const newColor = ref("");
const creating = ref(false);

const editingId = ref(null);
const editForm = ref({ name: "", color: "#00aeec", sort: 0 });
const saving = ref(false);

const load = async () => {
  loading.value = true;
  try {
    const res = await getAdminTopics();
    topics.value = Array.isArray(res.data) ? res.data : [];
  } catch {
    topics.value = [];
  } finally {
    loading.value = false;
  }
};

const handleCreate = async () => {
  const name = newName.value.trim();
  if (!name || creating.value) return;
  creating.value = true;
  try {
    await createAdminTopic({ name, color: newColor.value || undefined });
    message.success(`已创建话题「${name}」`);
    newName.value = "";
    newColor.value = "";
    await load();
    // 前台的话题栏 / 发布框都读这份缓存，改完要让它们重新拉
    topicStore.invalidate();
  } catch {
    /* request 层已提示具体原因 */
  } finally {
    creating.value = false;
  }
};

/** 历史脏数据：帖子用过但话题表没登记，点「登记」用同名补一条 */
const handleRegister = async (t) => {
  try {
    await createAdminTopic({ name: t.name, color: t.color });
    message.success(`已登记为「${t.name}」`);
    await load();
    topicStore.invalidate();
  } catch {
    /* 已提示 */
  }
};

const startEdit = (t) => {
  editingId.value = t.id;
  editForm.value = { name: t.name, color: t.color || "#00aeec", sort: t.sort ?? 0 };
};

const cancelEdit = () => {
  editingId.value = null;
};

const saveEdit = async (t) => {
  const name = editForm.value.name.trim();
  if (!name) {
    message.warning("话题名称不能为空");
    return;
  }
  if (saving.value) return;
  saving.value = true;
  try {
    await updateAdminTopic(t.id, {
      name,
      color: editForm.value.color,
      sort: Number(editForm.value.sort) || 0,
    });
    message.success("话题已更新");
    editingId.value = null;
    await load();
    topicStore.invalidate();
    // 话题名在帖子卡片上显示，让列表下次进页面重新拉
    topicStore.loadTopics(true);
  } catch {
    /* 已提示 */
  } finally {
    saving.value = false;
  }
};

const handleDelete = async (t) => {
  try {
    await ElMessageBox.confirm(
      `删除后无法恢复，「${t.name}」将从话题栏和发布框里消失。`,
      "删除话题",
      {
        type: "warning",
        confirmButtonText: "删除",
        cancelButtonText: "取消",
        customClass: "danger-confirm",
      }
    );
  } catch {
    return; // 用户取消
  }

  try {
    await deleteAdminTopic(t.id);
    message.success(`已删除「${t.name}」`);
    await load();
    topicStore.invalidate();
  } catch {
    /* 后端会说明「还有 N 篇帖子」，request 层已 toast */
  }
};

onMounted(load);
</script>

<style scoped>
.topics-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 940px;
}

/* ---------------- 新建 ---------------- */
.create-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  flex-wrap: wrap;
}

.create-bar__left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 240px;
}

.create-bar__input {
  flex: 1;
  min-width: 140px;
  height: 36px;
  padding: 0 12px;
  border-radius: 9px;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 0.8125rem;
  outline: none;
  transition: border-color 0.15s ease;
}

.create-bar__input:focus {
  border-color: var(--primary-color);
}

.create-bar__input::placeholder {
  color: var(--text-secondary);
}

.create-bar__color {
  position: relative;
  display: flex;
  align-items: center;
  gap: 7px;
  height: 36px;
  padding: 0 10px;
  border-radius: 9px;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  cursor: pointer;
  flex-shrink: 0;
}

/* 色点：自己画圆，不依赖原生 <input type=color> 的色块渲染 */
.swatch {
  display: block;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid var(--border-color);
  box-sizing: border-box;
  flex-shrink: 0;
}

/* 还没选颜色时用渐变色环表示「自动配色」 */
.swatch--auto {
  border-color: transparent;
  background: conic-gradient(#00aeec, #8b5cf6, #fb7299, #f5a623, #23c343, #00aeec);
}

/* 原生取色器铺满外层、完全透明，点哪儿都能唤起系统取色面板 */
.color-input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  padding: 0;
  border: none;
  opacity: 0;
  cursor: pointer;
}

.swatch-wrap {
  position: relative;
  display: inline-flex;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  cursor: pointer;
}

.create-bar__color-text {
  font-size: 0.75rem;
  color: var(--text-secondary);
  white-space: nowrap;
}

.create-bar__reset {
  height: 26px;
  padding: 0 9px;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.6875rem;
  cursor: pointer;
}

.create-bar__reset:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.page-tip {
  margin: 0 2px;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

/* ---------------- 列表 ---------------- */
.topic-panel {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  overflow: hidden;
}

.topic-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 130px 62px 74px 150px;
  gap: 10px;
  padding: 11px 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  font-size: 0.6875rem;
  color: var(--text-secondary);
}

.topic-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.topic-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 130px 62px 74px 150px;
  gap: 10px;
  align-items: center;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border-color);
  transition: background-color 0.15s ease;
}

.topic-row:last-child {
  border-bottom: none;
}

.topic-row:hover {
  background: var(--bg-secondary);
}

.topic-row__name {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
}

.topic-row__title {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag {
  flex-shrink: 0;
  padding: 1px 7px;
  border-radius: 6px;
  font-size: 0.625rem;
  line-height: 16px;
}

.tag--warn {
  background: rgba(245, 166, 35, 0.14);
  color: #f5a623;
}

.topic-row__cell {
  font-size: 0.75rem;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.topic-row__cell--value {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.6875rem;
  opacity: 0.85;
}

.topic-row__ops {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.inline-input {
  flex: 1;
  min-width: 0;
  height: 30px;
  padding: 0 9px;
  border-radius: 7px;
  border: 1px solid var(--primary-color);
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 0.8125rem;
  outline: none;
}

.inline-input--num {
  width: 62px;
  flex: none;
}

/* ---------------- 按钮 ---------------- */
.btn {
  height: 32px;
  padding: 0 14px;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  background: transparent;
  color: var(--text-primary);
  font-size: 0.8125rem;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}

.btn:hover:not(:disabled) {
  background: var(--bg-hover);
}

.btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.btn--primary {
  border-color: transparent;
  background: var(--primary-color);
  color: #fff;
}

.btn--primary:hover:not(:disabled) {
  background: var(--primary-color-hover);
}

.btn--sm {
  height: 28px;
  padding: 0 11px;
  border-radius: 8px;
  font-size: 0.75rem;
}

.btn--danger {
  color: #f53f3f;
  border-color: rgba(245, 63, 63, 0.35);
}

.btn--danger:hover:not(:disabled) {
  background: rgba(245, 63, 63, 0.1);
}

.topic-empty {
  margin: 36px 0;
  text-align: center;
  font-size: 0.8125rem;
  color: var(--text-secondary);
}

/* ---------------- 小屏：表格转卡片 ---------------- */
@media (max-width: 760px) {
  .topic-head {
    display: none;
  }

  .topic-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 10px;
    padding: 12px 14px;
  }

  /* 一行放不下时让名称独占一行，数字和操作跟在后面 */
  .topic-row__name {
    flex: 1 1 100%;
  }

  .topic-row__cell {
    font-size: 0.6875rem;
  }

  .topic-row__ops {
    flex: 1 0 auto;
    justify-content: flex-end;
  }

  .topic-row > .topic-row__cell + .topic-row__cell::before {
    content: "· ";
    opacity: 0.6;
  }
}
</style>
