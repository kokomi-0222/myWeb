<template>
  <Teleport to="body">
    <Transition name="report-modal">
      <div
        v-if="reportStore.visible && target"
        class="report-overlay"
        @click.self="close"
      >
        <div class="report-card" role="dialog" aria-modal="true" aria-labelledby="report-title">
          <header class="report-head">
            <h2 id="report-title" class="report-head__title">
              举报{{ typeLabel }}
            </h2>
            <button type="button" class="report-head__close" aria-label="关闭" @click="close">
              <IconClose :size="16" />
            </button>
          </header>

          <!-- 被举报对象的简述，让用户确认自己点的是哪一条 -->
          <p v-if="target.label" class="report-target">{{ target.label }}</p>

          <div class="report-section">
            <span class="report-section__label">举报理由</span>
            <div class="report-reasons" role="radiogroup" aria-label="举报理由">
              <button
                v-for="item in reportStore.reasonList"
                :key="item.code"
                type="button"
                class="report-reason"
                :class="{ 'is-active': reasonCode === item.code }"
                role="radio"
                :aria-checked="reasonCode === item.code"
                @click="reasonCode = item.code"
              >
                {{ item.label }}
              </button>
            </div>
            <p v-if="!reportStore.reasonList.length" class="report-hint">
              理由列表加载失败，请刷新后重试
            </p>
          </div>

          <div class="report-section">
            <span class="report-section__label">
              补充说明
              <em class="report-section__optional">（选填）</em>
            </span>
            <textarea
              v-model="detail"
              class="report-textarea"
              rows="3"
              maxlength="500"
              placeholder="可以说明具体问题，方便我们判断"
              @keydown.meta.enter="submit"
              @keydown.ctrl.enter="submit"
            ></textarea>
            <span class="report-counter">{{ detail.length }}/500</span>
          </div>

          <footer class="report-foot">
            <Button class="report-btn" type="default" @click="close">取消</Button>
            <Button
              class="report-btn report-btn--primary"
              type="bilibili"
              :disabled="submitting || !reasonCode"
              @click="submit"
            >
              {{ submitting ? "提交中…" : "提交举报" }}
            </Button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, ref, watch, onBeforeUnmount } from "vue";
import Button from "@/components/buttons/Button.vue";
import IconClose from "@/components/icons/IconClose.vue";
import { useReportStore } from "@/stores/report";
import { createReport } from "@/api/reports";
import { message } from "@/utils/message";

const reportStore = useReportStore();

const reasonCode = ref("");
const detail = ref("");
const submitting = ref(false);

const TYPE_LABEL = { post: "帖子", comment: "评论", user: "用户" };

const target = computed(() => reportStore.target);
const typeLabel = computed(() => TYPE_LABEL[target.value?.type] || "内容");

// 每次打开都从干净状态开始，避免上一条的说明残留
watch(
  () => reportStore.visible,
  (open) => {
    if (open) {
      reasonCode.value = "";
      detail.value = "";
      submitting.value = false;
      window.addEventListener("keydown", onKeydown);
    } else {
      window.removeEventListener("keydown", onKeydown);
    }
  }
);

onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));

function onKeydown(e) {
  if (e.key === "Escape") close();
}

function close() {
  if (submitting.value) return;
  reportStore.close();
}

async function submit() {
  if (submitting.value || !reasonCode.value || !target.value) return;
  submitting.value = true;
  try {
    const res = await createReport({
      targetType: target.value.type,
      targetId: target.value.id,
      reasonCode: reasonCode.value,
      detail: detail.value.trim() || undefined,
    });
    if (res.code === 200) {
      message("举报已提交，我们会尽快处理", "success");
      // 先标记再关闭：close() 会把 target 清空，顺序反了就拿不到 id。
      // 标记之后列表里那张卡片的菜单会变成「已举报」。
      reportStore.markReported(target.value.type, target.value.id);
      reportStore.close();
    } else {
      message(res.msg || "提交失败，请稍后重试", "error");
    }
  } catch (err) {
    message(err?.msg || "网络异常，请稍后重试", "error");
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.report-overlay {
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

.report-card {
  width: 440px;
  max-width: 100%;
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  padding: 20px 22px 18px;
  border-radius: 16px;
  background: var(--bg-primary);
  color: var(--text-primary);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.22);
}

.report-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.report-head__title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
}

.report-head__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.2s;
}

.report-head__close:hover {
  background: var(--bg-hover);
}

.report-target {
  margin: 8px 0 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 0.82rem;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.report-section {
  position: relative;
  margin-top: 16px;
}

.report-section__label {
  display: block;
  margin-bottom: 8px;
  font-size: 0.84rem;
  font-weight: 500;
  color: var(--text-secondary);
}

.report-section__optional {
  font-style: normal;
  font-weight: 400;
  color: var(--text-tertiary, var(--text-secondary));
  opacity: 0.7;
}

.report-reasons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.report-reason {
  padding: 7px 14px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 0.83rem;
  line-height: 1.3;
  cursor: pointer;
  transition:
    border-color 0.18s,
    background 0.18s,
    color 0.18s;
}

.report-reason:hover {
  border-color: var(--primary-color);
}

/* 选中态与站内分段控件保持一致：主色描边 + 淡主色底，不用实心块 */
.report-reason.is-active {
  border-color: var(--primary-color);
  background: color-mix(in srgb, var(--primary-color) 12%, transparent);
  color: var(--primary-color);
  font-weight: 500;
}

.report-textarea {
  display: block;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 0.85rem;
  line-height: 1.6;
  font-family: inherit;
  resize: vertical;
  min-height: 76px;
  max-height: 180px;
  box-sizing: border-box;
  transition: border-color 0.18s;
}

.report-textarea:focus {
  outline: none;
  border-color: var(--primary-color);
}

.report-counter {
  position: absolute;
  right: 10px;
  bottom: 6px;
  font-size: 0.72rem;
  color: var(--text-secondary);
  opacity: 0.65;
  pointer-events: none;
}

.report-hint {
  margin: 6px 0 0;
  font-size: 0.78rem;
  color: var(--text-secondary);
}

.report-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

/* Button.vue 只提供配色、没有尺寸，这里必须把尺寸喂进去 */
.report-btn {
  height: 34px;
  padding: 0 18px;
  border-radius: 9px;
  font-size: 0.85rem;
  cursor: pointer;
}

.report-btn--primary {
  min-width: 92px;
}

/* Button.vue 的 default 类型是浅灰实底，暗色下会变成一块白板。
   这里只改配色变量，不动组件本身，也不影响其它页面。 */
:global(:root.dark .report-btn:not(.report-btn--primary)) {
  --bg-color: transparent;
  --text-color: var(--text-primary);
  --hover-bg-color: var(--bg-hover);
  --hover-text-color: var(--text-primary);
  border: 1px solid var(--border-color);
}

/* 过渡 */
.report-modal-enter-active,
.report-modal-leave-active {
  transition: opacity 0.18s ease;
}

.report-modal-enter-from,
.report-modal-leave-to {
  opacity: 0;
}

.report-modal-enter-active .report-card {
  transition: transform 0.2s ease;
}

.report-modal-enter-from .report-card {
  transform: translateY(8px) scale(0.98);
}

@media (max-width: 480px) {
  .report-overlay {
    padding: 12px;
  }

  .report-card {
    padding: 16px 16px 14px;
    border-radius: 14px;
  }

  .report-reason {
    padding: 6px 12px;
    font-size: 0.8rem;
  }
}
</style>
