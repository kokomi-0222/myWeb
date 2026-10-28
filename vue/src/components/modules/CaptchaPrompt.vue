<template>
  <!--
    发验证码前的人机校验（内联一小块，不弹窗）。
    为什么内联而不是再套一层弹窗：它总是出现在「点发送验证码」之后、就在那个按钮下面，
    弹窗套弹窗在手机上会叠成两层蒙层，还得处理 Esc / 焦点；内联只占一行，关掉也不费事。
  -->
  <div class="cp">
    <div class="cp-row">
      <!-- 输入框跟登录弹窗里的 InputLine 同一套语言：透明底、只留底部一条线，
           聚焦时线从左边扫满。别改回四边描边的卡片，会和上面的邮箱框打架 -->
      <div class="cp-field">
        <input
          ref="inputRef"
          v-model="code"
          class="cp-input"
          type="text"
          autocomplete="off"
          spellcheck="false"
          :maxlength="LENGTH"
          placeholder="输入图中字符"
          @input="onInput"
          @keyup.enter="submit"
        />
      </div>
      <button
        type="button"
        class="cp-img"
        title="看不清？点一下换一张"
        :disabled="loading"
        @click="refresh"
      >
        <img v-if="image" :src="image" alt="图形验证码" />
        <span v-else class="cp-img__ph">{{ loading ? "加载中" : "点击获取" }}</span>
      </button>
      <button
        type="button"
        class="cp-ok"
        :disabled="loading || !captchaKey || code.trim().length < LENGTH"
        @click="submit"
      >
        确定
      </button>
    </div>

    <!-- 提示和错误共用同一行：切换只换颜色和文字，不换结构 ——
         否则一报错「取消」就消失、整块还会上下跳一下 -->
    <p class="cp-note" :class="{ 'cp-err': !!err }">
      <span class="cp-note__text">{{ err || "发信前需通过人机校验" }}</span>
      <button type="button" class="cp-cancel" @click="$emit('cancel')">取消</button>
    </p>
    <!-- 本地调试码：只有后端开了 app.captcha.dev-echo 才会返回明文（线上恒为 null），
         和注册/找回密码页的「本地调试码」是同一套约定，UI 验收脚本靠它自动填 -->
    <p v-if="devCode" class="cp-dev">本地调试码：<b>{{ devCode }}</b></p>
  </div>
</template>

<script setup lang="ts">
/**
 * 图形验证码交互块（发邮件验证码前用）。
 *
 * 和后端约定：本组件只负责「拿到 captchaKey + 用户输入的字符」然后 emit 出去，
 * **不自己调发码接口** —— 发码的路径有三条（注册 / 找回密码 / 绑换邮箱），
 * 各自的前置条件不一样（同意协议、当前密码、账号已有邮箱），
 * 让父组件拿着这一对值去调自己的接口，失败时调用下方暴露的 fail() 换一张图。
 *
 * ⚠️ 后端的人机校验是「只验不删」：业务校验失败（邮箱已被注册、密码不对）不烧图，
 * 所以这里失败后换图是**主动**的 —— 让用户换一张比让他对着同一张再猜一次更友好。
 */
import { ref, onMounted } from "vue";
import { getCaptcha } from "@/api/captcha";

const emit = defineEmits<{
  (e: "confirm", payload: { captchaKey: string; captchaCode: string }): void;
  (e: "cancel"): void;
}>();

/** 后端 createShearCaptcha(200, 80, 4, 4) 是 4 位，改后端要同步这里 */
const LENGTH = 4;

const inputRef = ref<HTMLInputElement | null>(null);
const image = ref("");
const captchaKey = ref("");
const code = ref("");
const err = ref("");
const loading = ref(false);
/** 本地调试码（后端 dev-echo 才有；线上恒为空） */
const devCode = ref("");

const refresh = async () => {
  loading.value = true;
  err.value = "";
  code.value = "";
  devCode.value = "";
  try {
    const res = await getCaptcha();
    image.value = res?.data?.captchaImage || "";
    captchaKey.value = res?.data?.captchaKey || "";
    devCode.value = res?.data?.captchaCode || "";
  } catch (e: any) {
    image.value = "";
    captchaKey.value = "";
    err.value = e?.message || "验证码加载失败，点图片重试";
  } finally {
    loading.value = false;
    inputRef.value?.focus();
  }
};

const onInput = () => {
  // 只留可见字符，顺手去掉中文输入法的全角字母
  code.value = code.value.replace(/\s/g, "").slice(0, LENGTH);
  err.value = "";
};

const submit = () => {
  if (loading.value || !captchaKey.value) return;
  const value = code.value.trim();
  if (value.length < LENGTH) {
    err.value = `请输入完整的 ${LENGTH} 位字符`;
    inputRef.value?.focus();
    return;
  }
  emit("confirm", { captchaKey: captchaKey.value, captchaCode: value });
};

/**
 * 父组件发码失败时调用：把错误落在这一行，并换一张图（旧 key 已经不对了）。
 * ⚠️ 必须先把图换掉再写错误文字 —— refresh() 开头会清空 err，
 * 顺序反过来的话红字刚写上就被清掉，用户只看到图闪了一下。
 */
const fail = async (text: string) => {
  const msg = text || "图形验证码不对，换一张再试";
  await refresh();
  err.value = msg;
};

defineExpose({ refresh, fail });

onMounted(() => {
  refresh();
});
</script>

<style scoped>
.cp {
  display: flex;
  flex-direction: column;
  gap: 10px;
  /* 跟上面那行「邮箱 + 发送验证码」拉开一点，否则贴着像挤在同一格里 */
  margin-top: 16px;
}

.cp-row {
  display: flex;
  align-items: flex-end;
  gap: 10px;
}

/* 下划线输入框：复刻 InputLine 的观感（透明底 + 底部渐显线） */
.cp-field {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 36px;
  display: flex;
  align-items: center;
}

.cp-field::after {
  content: "";
  position: absolute;
  left: 0;
  bottom: 0;
  width: 100%;
  height: 2px;
  background-color: var(--input-line-border-bottom);
  background-image: linear-gradient(
    to right,
    var(--input-line-wrapper-after),
    var(--input-line-wrapper-after)
  );
  background-size: 0 100%;
  background-repeat: no-repeat;
  background-position: left center;
  transition:
    background-size 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94),
    box-shadow 0.7s;
  pointer-events: none;
}

.cp-field:hover::after {
  background-size: 100% 100%;
}

.cp-field:focus-within::after {
  background-size: 100% 100%;
  box-shadow: 0 -2px 4px var(--input-line-password-toggle-hover);
}

.cp-input {
  width: 100%;
  padding: 0 2px;
  border: none;
  background: transparent;
  color: var(--input-line-content);
  font-family: inherit;
  font-size: 0.9rem;
  line-height: 20px;
  letter-spacing: 3px;
  outline: none;
}

.cp-input::placeholder {
  letter-spacing: 0;
  color: var(--input-line-placeholder);
}

/* 200×80 的图等比缩成 100×40 —— 之前 108 宽会按宽度铺满、把上下裁掉一截，
   字符头顶和脚底都被切了 */
.cp-img {
  flex: 0 0 auto;
  width: 90px;
  height: 36px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: var(--bg-secondary);
  overflow: hidden;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.92;
  transition: opacity 0.15s ease;
}

.cp-img:hover:not(:disabled) {
  opacity: 1;
}

.cp-img:disabled {
  cursor: default;
}

.cp-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.cp-img__ph {
  font-size: 12px;
  color: var(--text-secondary);
  user-select: none;
}

/* 跟同一行上方的「发送验证码」按钮同款：透明底 + 描边 + 主色字。
   实心蓝会抢走「下一步」的视觉重量 */
.cp-ok {
  flex: 0 0 auto;
  height: 36px;
  padding: 0 14px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: transparent;
  color: var(--primary-color);
  font-family: inherit;
  font-size: 0.78rem;
  white-space: nowrap;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    color 0.15s ease;
}

.cp-ok:hover:not(:disabled) {
  border-color: var(--primary-color);
}

.cp-ok:disabled {
  color: var(--text-secondary);
  cursor: not-allowed;
}

.cp-note {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin: 0;
  padding: 0 2px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
}

/* 错误态只换颜色（文案由模板切），结构不动 */
.cp-note.cp-err {
  color: #f53f3f;
}

.cp-note__text {
  min-width: 0;
}

.cp-cancel {
  flex: 0 0 auto;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 12px;
  text-decoration: underline;
  cursor: pointer;
}

.cp-cancel:hover {
  color: var(--text-primary);
}

.cp-dev {
  margin: 0;
  padding: 4px 8px;
  border-radius: 6px;
  background: var(--bg-nomarl);
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.cp-dev b {
  color: var(--primary-color);
  letter-spacing: 1px;
}

@media (max-width: 420px) {
  /* 窄屏也不把「确定」换到下一行 —— 用户要求按钮别占满一行。
     图固定 100 宽（后端画的是 200×80，等比缩一半，不能再压否则字糊），
     靠缩间距 + 输入框 flex:1 收窄来腾位置 */
  .cp-row {
    gap: 8px;
  }

  .cp {
    margin-top: 12px;
  }

  .cp-ok {
    padding: 0 12px;
  }
}
</style>
