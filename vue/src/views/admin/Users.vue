<template>
  <div class="users-page">
    <!-- 头部：搜索。页面标题在后台顶栏，这里只放计数和搜索 -->
    <div class="users-head">
      <div class="users-head__left">
        <span class="users-head__count">{{ total }} 位用户</span>
      </div>
      <div class="users-head__search">
        <IconSearch size="15" class="users-head__icon" />
        <input
          v-model="keyword"
          class="users-head__input"
          type="text"
          placeholder="搜索账号 / 昵称 / 邮箱"
          @keyup.enter="handleSearch"
        />
        <button
          v-if="keyword"
          type="button"
          class="users-head__clear"
          aria-label="清空"
          @click="handleClear"
        >
          <IconClose size="12" />
        </button>
      </div>
    </div>

    <p class="users-tip">
      点角色标签即可切换，改动立即生效。角色能做什么由「角色权限」页决定；
      右侧「外观」可以单独设置每个人的名字颜色和身份标签颜色。
    </p>

    <!-- 骨架 -->
    <ul v-if="loading && list.length === 0" class="user-list">
      <li v-for="n in 3" :key="'sk-' + n" class="user-row user-row--skeleton">
        <span class="sk-avatar"></span>
        <div class="sk-lines">
          <span class="sk-line" style="width: 34%"></span>
          <span class="sk-line" style="width: 62%"></span>
        </div>
      </li>
    </ul>

    <!-- 列表 -->
    <ul v-else-if="list.length > 0" class="user-list">
      <li v-for="u in list" :key="u.id" class="user-row">
        <Avatar :src="u.avatar" :alt="u.name" :size="40" />

        <div class="user-row__main">
          <div class="user-row__top">
            <span class="user-row__name">{{ u.name || u.username || "未命名用户" }}</span>
            <span v-if="u.id === myId" class="user-row__me">我</span>
            <span class="user-row__meta">#{{ u.id }}</span>
            <span v-if="u.username" class="user-row__meta">@{{ u.username }}</span>
          </div>

          <div class="user-row__roles">
            <button
              v-for="r in roleOptions"
              :key="r.code"
              type="button"
              class="role-chip"
              :class="{
                'is-on': u.roles.includes(r.code),
                'is-locked': isLocked(u, r.code),
              }"
              :disabled="savingId === u.id || isLocked(u, r.code)"
              :title="isLocked(u, r.code) ? '不能移除自己的管理员角色' : r.code"
              @click="toggleRole(u, r.code)"
            >
              {{ r.name }}
            </button>
          </div>
        </div>

        <div class="user-row__side">
          <span v-if="savingId === u.id" class="user-row__state">保存中…</span>
          <span v-else-if="u.roles.length === 0" class="user-row__state is-warn">无角色</span>
          <span
            v-if="u.emailVerified === false"
            class="ban-chip verify-chip"
            :title="
              u.email
                ? '邮箱未验证：能登录能浏览，但发帖 / 评论 / 举报会被拦'
                : '还没绑定邮箱（升级前注册的老账号）：让他去「个人中心 → 账号管理」绑一个'
            "
          >
            {{ u.email ? "未验证" : "未绑邮箱" }}
          </span>
          <span
            v-if="u.status"
            class="ban-chip"
            :class="{ 'ban-chip--mute': u.status === 1 }"
            :title="u.banReason || '违反社区规范'"
          >
            {{ u.status === 1 ? "已禁言" : "已封号" }}{{ banSuffix(u) }}
          </span>
        </div>

        <!-- 处罚 / 解除：正常时给两种力度，被处罚时只留「解除」 -->
        <button
          v-if="!u.status"
          type="button"
          class="user-row__style-btn"
          title="禁言：能登录，但不能发帖和评论"
          :disabled="!canPunish(u)"
          @click="openPunish(u, 1)"
        >
          禁言
        </button>
        <button
          v-if="!u.status"
          type="button"
          class="user-row__style-btn user-row__ban"
          title="封号：不能登录"
          :disabled="!canPunish(u)"
          @click="openPunish(u, 2)"
        >
          封号
        </button>
        <button
          v-else
          type="button"
          class="user-row__style-btn user-row__unban"
          title="解除处罚，恢复正常"
          @click="handleUnban(u)"
        >
          解除
        </button>

        <!--
          手动激活：SMTP 故障时给「有邮箱但没验证」的账号兜底。
          没有邮箱的账号不显示 —— 后端没有邮箱可标记，会直接拒绝；
          这种账号应该引导用户自己去个人中心绑定（绑定本来就要求他本人收码）。
        -->
        <button
          v-if="u.emailVerified === false && u.email"
          type="button"
          class="user-row__style-btn"
          title="手动把邮箱标记为已验证，让对方立刻可以发言"
          @click="handleVerifyEmail(u)"
        >
          激活
        </button>

        <!-- 外观：名字颜色 + 身份标签底色 -->
        <button
          type="button"
          class="user-row__style-btn"
          title="设置名字颜色和身份标签颜色"
          @click="openStyle(u)"
        >
          <span
            class="swatch"
            :style="{ background: normalizeHex(u.nameColor) || 'var(--border-color)' }"
          ></span>
          <span
            class="swatch"
            :style="{
              background:
                normalizeHex(u.roleColor) ||
                normalizeHex(u.nameColor) ||
                'var(--border-color)',
            }"
          ></span>
          外观
        </button>
      </li>
    </ul>

    <!-- 空态 -->
    <div v-else class="users-empty">
      <IconPerson size="36" class="users-empty__icon" />
      <p>{{ keyword ? "没有找到匹配的用户" : "还没有用户" }}</p>
    </div>

    <div v-if="total > pageSize" class="users-pager">
      <Pagination
        v-model="pageNum"
        :total-items="total"
        :page-size="pageSize"
        @change="load"
      />
    </div>

    <!-- 外观设置弹层：自己写，不用 ElMessageBox（里面要放取色器，而且它的样式被全局覆盖过） -->
    <Teleport to="body">
      <div v-if="styleTarget" class="style-mask" @click.self="closeStyle">
        <div class="style-panel" role="dialog" aria-modal="true">
          <header class="style-panel__head">
            <h3 class="style-panel__title">
              外观 · {{ styleTarget.name || styleTarget.username || "未命名用户" }}
            </h3>
            <button type="button" class="style-panel__close" @click="closeStyle">
              <IconClose size="12" />
            </button>
          </header>

          <!-- 实时预览 -->
          <div class="style-panel__preview">
            <Avatar :src="styleTarget.avatar" :alt="styleTarget.name" :size="44" />
            <div class="style-panel__preview-main">
              <span class="style-panel__preview-name" :style="previewNameStyle">
                {{ styleTarget.name || styleTarget.username || "未命名用户" }}
              </span>
              <span class="style-panel__preview-tag" :style="previewTagStyle">
                {{ roleLabelOf(styleTarget.primaryRole) || "普通用户" }}
              </span>
            </div>
          </div>

          <div class="style-row">
            <span class="style-row__label">名字颜色</span>
            <input v-model="nameColorPicker" type="color" class="style-row__color" />
            <input
              v-model="styleForm.nameColor"
              type="text"
              class="style-row__hex"
              maxlength="7"
              placeholder="留空用默认"
            />
            <button type="button" class="style-row__clear" @click="styleForm.nameColor = ''">
              清除
            </button>
          </div>

          <div class="style-row">
            <span class="style-row__label">身份标签</span>
            <input v-model="roleColorPicker" type="color" class="style-row__color" />
            <input
              v-model="styleForm.roleColor"
              type="text"
              class="style-row__hex"
              maxlength="7"
              placeholder="留空跟随名字"
            />
            <button type="button" class="style-row__clear" @click="styleForm.roleColor = ''">
              清除
            </button>
          </div>

          <p class="style-tip">
            身份标签是「我的空间」里名字旁边那个方块，也会用在帖子和主页的
            「管理员 / 版主」小标签上。留空则跟随名字颜色。
          </p>

          <footer class="style-panel__foot">
            <button
              type="button"
              class="style-ghost"
              :disabled="savingStyle"
              @click="resetStyle"
            >
              恢复默认
            </button>
            <div class="style-panel__foot-right">
              <button
                type="button"
                class="style-ghost"
                :disabled="savingStyle"
                @click="closeStyle"
              >
                取消
              </button>
              <Button
                type="bilibili"
                class="admin-btn"
                :disabled="savingStyle"
                @click="saveStyle"
              >
                {{ savingStyle ? "保存中…" : "保存" }}
              </Button>
            </div>
          </footer>
        </div>
      </div>
    </Teleport>

    <!-- 处罚面板：选力度 + 时长 + 理由。走 Teleport 避免被 .user-list 的滚动裁掉 -->
    <Teleport to="body">
      <div v-if="punishTarget" class="style-mask" @click.self="closePunish">
        <div class="style-panel punish-panel" role="dialog" aria-modal="true">
          <header class="style-panel__head">
            <span class="style-panel__title">
              {{ punishForm.level === 1 ? "禁言" : "封号" }}
              {{ punishTarget.name || punishTarget.username || "该用户" }}
            </span>
            <button type="button" class="style-panel__close" aria-label="关闭" @click="closePunish">
              <IconClose size="16" />
            </button>
          </header>

          <div class="punish-level" role="radiogroup" aria-label="处罚方式">
            <button
              v-for="opt in PUNISH_LEVELS"
              :key="opt.level"
              type="button"
              class="punish-level__item"
              :class="{ 'is-on': punishForm.level === opt.level }"
              role="radio"
              :aria-checked="punishForm.level === opt.level"
              @click="punishForm.level = opt.level"
            >
              <span class="punish-level__name">{{ opt.name }}</span>
              <span class="punish-level__desc">{{ opt.desc }}</span>
            </button>
          </div>

          <div class="punish-days">
            <button
              v-for="d in PUNISH_DAYS"
              :key="d.value"
              type="button"
              class="punish-days__item"
              :class="{ 'is-on': punishForm.days === d.value }"
              @click="punishForm.days = d.value"
            >
              {{ d.text }}
            </button>
          </div>

          <input
            v-model="punishForm.reason"
            class="style-row__hex punish-reason"
            type="text"
            maxlength="200"
            placeholder="理由（本人会看到，可留空）"
          />

          <p class="style-tip">
            {{ punishForm.level === 1
              ? "禁言期间对方仍能登录和浏览，但发不出帖子、评论和回复；不会把人踢下线。"
              : "封号后对方无法登录，已登录的会话也会立刻失效。" }}
            永久处罚不会自动到期，需要在这里点「解除」。
          </p>

          <footer class="style-panel__foot">
            <button type="button" class="style-ghost" :disabled="punishing" @click="closePunish">
              取消
            </button>
            <Button
              type="bilibili"
              class="admin-btn"
              :disabled="punishing"
              @click="submitPunish"
            >
              {{ punishing ? "处理中…" : "确定" }}
            </Button>
          </footer>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from "vue";
import { ElMessageBox } from "element-plus";
import IconSearch from "@/components/icons/IconSearch.vue";
import IconClose from "@/components/icons/IconClose.vue";
import IconPerson from "@/components/icons/IconPerson.vue";
import { getAdminUsers, getAdminRoleList, updateUserRoles, updateUserStyle, unbanUser, punishUser, verifyUserEmail } from "@/api/admin";
import { useUserStore } from "@/stores/user";
import {
  normalizeHex,
  roleLabelOf,
  roleBlockColor,
  contrastText,
} from "@/utils/roleTag";
import message from "@/utils/message";

const userStore = useUserStore();
const myId = computed(() => userStore.user?.id);

// 角色编码 → 中文名，只作为「后端还没响应」时的兜底。
// 真名字从 /admin/role/list 来：后台自建的角色也能在这里显示成中文。
const ROLE_LABELS = {
  admin: "管理员",
  moderator: "版主",
  editor: "编辑",
  vip: "会员",
  member: "普通用户",
  guest: "游客",
};

const FALLBACK_ROLES = Object.entries(ROLE_LABELS).map(([code, name]) => ({ code, name }));

const list = ref([]);
const total = ref(0);
const pageNum = ref(1);
const pageSize = 20;
const keyword = ref("");
const loading = ref(false);
const savingId = ref(null);
// [{ code, name }]，顺序跟 role.sort 走
const roleOptions = ref(FALLBACK_ROLES);

/** 自己身上的 admin 不能被自己取消，避免把自己锁在门外 */
const isLocked = (user, roleCode) =>
  roleCode === "admin" && user.id === myId.value && user.roles.includes("admin");

const load = async () => {
  loading.value = true;
  try {
    const res = await getAdminUsers({
      keyword: keyword.value.trim() || undefined,
      pageNum: pageNum.value,
      pageSize,
    });
    const data = res.data || {};
    list.value = Array.isArray(data.list) ? data.list : [];
    total.value = Number(data.total || 0);
  } catch (err) {
    // 403 / 网络异常已经在 request 层弹过提示，这里只兜住状态
    list.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
};

/** 角色字典以后端为准（含后台自建的角色），拉不到就用本地这 6 个兜底 */
const loadRoles = async () => {
  try {
    const res = await getAdminRoleList();
    const rows = Array.isArray(res.data) ? res.data : [];
    if (rows.length) {
      roleOptions.value = rows.map((r) => ({ code: r.roleCode, name: r.roleName }));
    }
  } catch {
    /* 保持默认 */
  }
};

const handleSearch = () => {
  pageNum.value = 1;
  load();
};

const handleClear = () => {
  keyword.value = "";
  handleSearch();
};

/**
 * 点一下角色标签 = 立即保存。
 * 不做「先攒改动再点保存」：这里一次只改一个人，立即生效更符合直觉，
 * 失败就把本地状态回滚。
 */
const toggleRole = async (user, roleCode) => {
  if (savingId.value === user.id) return;

  const had = user.roles.includes(roleCode);
  const next = had
    ? user.roles.filter((r) => r !== roleCode)
    : [...user.roles, roleCode];

  if (next.length === 0) {
    message.warning("至少要保留一个角色");
    return;
  }

  savingId.value = user.id;
  try {
    await updateUserRoles(user.id, next);
    user.roles = next;
    message.success(`已更新「${user.name || user.username || "该用户"}」的角色`);
  } catch (err) {
    // request 层已弹过具体原因，这里不再重复弹
    if (!err?.message) message.error("角色更新失败");
  } finally {
    savingId.value = null;
  }
};

onMounted(() => {
  loadRoles();
  load();
});

/* ---------------- 外观设置 ---------------- */

const styleTarget = ref(null);
const styleForm = reactive({ nameColor: "", roleColor: "" });
const savingStyle = ref(false);

/** 取色器必须有合法值，未设置时给个占位色，真实状态看右边的十六进制输入框 */
const nameColorPicker = computed({
  get: () => normalizeHex(styleForm.nameColor) || "#636161",
  set: (v) => {
    styleForm.nameColor = v;
  },
});

const roleColorPicker = computed({
  get: () =>
    normalizeHex(styleForm.roleColor) ||
    normalizeHex(styleForm.nameColor) ||
    "#fb7299",
  set: (v) => {
    styleForm.roleColor = v;
  },
});

const previewNameStyle = computed(() => ({
  color: normalizeHex(styleForm.nameColor) || "var(--text-primary)",
}));

const previewTagStyle = computed(() => {
  // 清空「标签底色」时预览要显示角色默认色（游客深灰 / 普通用户蓝…），
  // 不是 nameColor —— 后者是名字色，拿它当牌子底色会让所有等级长成同一个黑块。
  const bg = roleBlockColor(
    styleForm.roleColor,
    styleForm.nameColor,
    styleTarget.value?.primaryRole
  );
  return {
    backgroundColor: bg || "var(--bg-secondary)",
    color: bg ? contrastText(bg) : "var(--text-primary)",
  };
});

/** 处罚标签的补充说明：没有到期时间就是永久 */
function banSuffix(u) {
  if (!u.banUntil) return "（永久）";
  const d = new Date(u.banUntil);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `（至 ${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}）`;
}

/** 手动激活邮箱：发信服务出问题、或老手机号账号没有邮箱时的兜底入口 */
async function handleVerifyEmail(u) {
  const name = u.name || u.username || `#${u.id}`;
  try {
    await ElMessageBox.confirm(
      `标记后「${name}」立刻可以发帖和评论，不需要再收验证码。只在对方确实收不到邮件时用。`,
      "手动激活邮箱",
      { type: "info", confirmButtonText: "激活", cancelButtonText: "取消" }
    );
  } catch {
    return; // 用户取消
  }
  try {
    const res = await verifyUserEmail(u.id);
    if (res.code === 200) {
      message(res.msg || "已激活", "success");
      load();
    } else {
      message(res.msg || "操作失败", "error");
    }
  } catch (err) {
    message(err?.msg || "网络异常，请稍后重试", "error");
  }
}

/** 解除：永久处罚没有自动到期，只能从这里撤销 */
async function handleUnban(u) {
  const name = u.name || u.username || `#${u.id}`;
  const what = u.status === 1 ? "禁言" : "封号";
  try {
    await ElMessageBox.confirm(
      `解除后「${name}」可以立即恢复发帖和评论。`,
      `解除${what}`,
      {
        type: "info",
        confirmButtonText: "解除",
        cancelButtonText: "取消",
      }
    );
  } catch {
    return; // 用户取消
  }
  try {
    const res = await unbanUser(u.id);
    if (res.code === 200) {
      message(res.msg || "已解除", "success");
      load();
    } else {
      message(res.msg || "操作失败", "error");
    }
  } catch (err) {
    message(err?.msg || "网络异常，请稍后重试", "error");
  }
}

/* ---------------- 处罚（禁言 / 封号） ---------------- */

const PUNISH_LEVELS = [
  { level: 1, name: "禁言", desc: "能登录，不能发帖评论" },
  { level: 2, name: "封号", desc: "不能登录" },
];

const PUNISH_DAYS = [
  { value: 1, text: "1 天" },
  { value: 3, text: "3 天" },
  { value: 7, text: "7 天" },
  { value: 30, text: "30 天" },
  { value: -1, text: "永久" },
];

const punishTarget = ref(null);
const punishing = ref(false);
const punishForm = reactive({ level: 1, days: 7, reason: "" });

/**
 * 后端会拦「罚自己」和「罚有 user:manage 的人」，
 * 这里先把按钮禁掉，省得点进去才看到 403。
 */
const MANAGED_ROLES = ["admin"];
function canPunish(u) {
  if (u.id === myId.value) return false;
  // 没有 admin 角色的人也可能被单独授过 user:manage，
  // 那种情况前端查不到，交给后端兜底
  return !(u.roles || []).some((r) => MANAGED_ROLES.includes(r));
}

function openPunish(u, level) {
  if (!canPunish(u)) {
    message.warning("不能处罚自己或拥有后台管理权限的用户");
    return;
  }
  punishTarget.value = u;
  punishForm.level = level;
  punishForm.days = 7;
  punishForm.reason = "";
}

function closePunish() {
  if (punishing.value) return;
  punishTarget.value = null;
}

async function submitPunish() {
  if (!punishTarget.value || punishing.value) return;
  const u = punishTarget.value;
  const name = u.name || u.username || `#${u.id}`;
  const what = punishForm.level === 1 ? "禁言" : "封号";
  const howLong = punishForm.days === -1 ? "永久" : `${punishForm.days} 天`;
  // 说清楚后果，别让人只看到「确定要禁言吗」就点下去
  const effect = punishForm.level === 1
    ? howLong === "永久"
      ? "对方仍能登录和浏览，但将永远发不了帖子、评论和回复。"
      : `对方仍能登录和浏览，但在 ${howLong}内发不了帖子、评论和回复。`
    : punishForm.days === -1
      ? "对方将无法再登录，且不会自动解除。"
      : `对方将无法登录，${howLong}后自动恢复。`;

  try {
    await ElMessageBox.confirm(
      `${effect}确定对「${name}」执行${howLong}${what}吗？`,
      `确认${what}`,
      {
        type: "warning",
        confirmButtonText: what,
        cancelButtonText: "取消",
        customClass: "danger-confirm",
      }
    );
  } catch {
    return; // 用户取消
  }

  punishing.value = true;
  try {
    const res = await punishUser(u.id, {
      level: punishForm.level,
      days: punishForm.days,
      reason: punishForm.reason.trim() || undefined,
    });
    if (res.code === 200) {
      message(`已${what}「${name}」`, "success");
      punishing.value = false;
      closePunish();
      load();
    } else {
      message(res.msg || "操作失败", "error");
    }
  } catch (err) {
    message(err?.msg || "网络异常，请稍后重试", "error");
  } finally {
    punishing.value = false;
  }
}

const openStyle = (user) => {  styleTarget.value = user;
  styleForm.nameColor = normalizeHex(user.nameColor);
  styleForm.roleColor = normalizeHex(user.roleColor);
};

const closeStyle = () => {
  if (savingStyle.value) return;
  styleTarget.value = null;
};

const resetStyle = () => {
  styleForm.nameColor = "";
  styleForm.roleColor = "";
};

const saveStyle = async () => {
  if (!styleTarget.value || savingStyle.value) return;

  // 前端先挡一道，别让用户点了保存才看到后端的格式报错
  const bad = [styleForm.nameColor, styleForm.roleColor].some(
    (v) => v && !normalizeHex(v)
  );
  if (bad) {
    message.warning("颜色要写成 #RRGGBB 六位十六进制，或者留空");
    return;
  }

  savingStyle.value = true;
  try {
    // 空串交给后端转 NULL，表示恢复默认
    const payload = {
      nameColor: normalizeHex(styleForm.nameColor),
      roleColor: normalizeHex(styleForm.roleColor),
    };
    await updateUserStyle(styleTarget.value.id, payload);
    // 列表里就地更新，省一次整页刷新
    styleTarget.value.nameColor = payload.nameColor;
    styleTarget.value.roleColor = payload.roleColor;
    message.success("外观已更新，对方刷新页面后可见");
    styleTarget.value = null;
  } catch (err) {
    if (!err?.message) message.error("外观保存失败");
  } finally {
    savingStyle.value = false;
  }
};
</script>

<style scoped>
.users-page {
  display: flex;
  flex-direction: column;
}

/* ---------- 头部 ---------- */
.users-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 2px 4px 10px;
}

.users-head__left {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.users-head__title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-primary);
}

.users-head__count {
  font-size: 0.8125rem;
  color: var(--text-secondary);
}

.users-head__search {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 34px;
  padding: 0 10px;
  border-radius: 10px;
  background: var(--bg-nomarl);
  border: 1px solid transparent;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.users-head__search:focus-within {
  border-color: var(--primary-color);
  background: var(--bg-primary);
}

.users-head__icon {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.users-head__input {
  width: 170px;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 0.8125rem;
}

.users-head__input::placeholder {
  color: var(--text-secondary);
}

.users-head__clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--border-color);
  color: var(--text-secondary);
  cursor: pointer;
}

.users-head__clear:hover {
  background: var(--primary-color);
  color: #fff;
}

.users-tip {
  margin: 0 4px 10px;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

/* ---------- 列表 ---------- */
.user-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.user-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  transition: border-color 0.15s ease;
}

.user-row:hover {
  border-color: var(--primary-color);
}

.user-row__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.user-row__top {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  min-width: 0;
}

.user-row__name {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 220px;
}

.user-row__me {
  padding: 0 6px;
  border-radius: 6px;
  background: #fb7299;
  color: #fff;
  font-size: 0.6875rem;
  line-height: 16px;
}

.user-row__meta {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.user-row__roles {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* ---------- 角色标签 ---------- */
.role-chip {
  height: 26px;
  padding: 0 11px;
  border-radius: 13px;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.8125rem;
  line-height: 1;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease,
    border-color 0.15s ease;
}

.role-chip:not(.is-on):not(:disabled):hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.role-chip.is-on {
  background: var(--primary-color-soft);
  border-color: transparent;
  color: var(--primary-color);
  font-weight: 600;
}

.role-chip.is-locked {
  cursor: not-allowed;
  opacity: 0.7;
}

.role-chip:disabled {
  cursor: default;
}

.user-row__side {
  flex-shrink: 0;
  min-width: 52px;
  text-align: right;
}

.user-row__state {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.user-row__state.is-warn {
  color: #f5a623;
}

/* ---------- 骨架 ---------- */
.user-row--skeleton {
  align-items: center;
}

.sk-avatar,
.sk-line {
  display: block;
  border-radius: 6px;
  background: var(--bg-nomarl);
  animation: sk-pulse 1.2s ease-in-out infinite;
}

.sk-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  flex-shrink: 0;
}

.sk-lines {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sk-line {
  height: 12px;
}

@keyframes sk-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

/* ---------- 空态 ---------- */
.users-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 56px 0;
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.users-empty__icon {
  color: var(--text-secondary);
  opacity: 0.6;
}

.users-pager {
  margin-top: 8px;
}

/* ---------- 外观按钮 ---------- */
.user-row__style-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.75rem;
  line-height: 1;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease,
    color 0.15s ease;
}

.user-row__style-btn:hover {
  border-color: var(--primary-color);
  background: var(--primary-color-soft);  color: var(--primary-color);
}

.swatch {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.1);
}

/* ---------- 外观弹层 ---------- */
.style-mask {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.42);
  backdrop-filter: blur(2px);
}

.style-panel {
  width: 100%;
  max-width: 420px;
  padding: 20px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.24);
  animation: style-pop 0.18s ease-out;
}

@keyframes style-pop {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.style-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}

.style-panel__title {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 700;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.style-panel__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--bg-nomarl);
  color: var(--text-secondary);
  cursor: pointer;
  flex-shrink: 0;
}

.style-panel__close:hover {
  background: var(--border-color);
  color: var(--text-primary);
}

.style-panel__preview {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  margin-bottom: 14px;
  border-radius: 12px;
  background: var(--bg-nomarl);
}

.style-panel__preview-main {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}

.style-panel__preview-name {
  font-size: 1rem;
  font-weight: 700;
}

.style-panel__preview-tag {
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.8rem;
  line-height: 1.3;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.style-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.style-row__label {
  width: 62px;
  flex-shrink: 0;
  font-size: 0.8125rem;
  color: var(--text-secondary);
}

.style-row__color {
  width: 34px;
  height: 30px;
  padding: 2px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-primary);
  cursor: pointer;
  flex-shrink: 0;
}

.style-row__hex {
  flex: 1;
  min-width: 0;
  height: 30px;
  padding: 0 9px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 0.8125rem;
  outline: none;
  transition: border-color 0.15s ease;
}

.style-row__hex:focus {
  border-color: var(--primary-color);
}

.style-row__clear {
  flex-shrink: 0;
  height: 30px;
  padding: 0 9px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.75rem;
  cursor: pointer;
}

.style-row__clear:hover {
  color: #f53f3f;
}

.style-tip {
  margin: 4px 0 16px;
  font-size: 0.75rem;
  line-height: 1.6;
  color: var(--text-secondary);
}

.style-panel__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.style-panel__foot-right {
  display: flex;
  gap: 8px;
}

/* 次级按钮自己做，不用 Button 的 default 类型：
   它把 --bg-color 写死成 #ebebeb，暗色主题下压不住，和背景糊在一起 */
.style-ghost {
  height: 32px;
  padding: 0 14px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.8125rem;
  font-family: inherit;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    color 0.15s ease,
    background-color 0.15s ease;
}

.style-ghost:hover:not(:disabled) {
  border-color: var(--primary-color);
  color: var(--primary-color);
  background: var(--primary-color-soft);
}

.style-ghost:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* ---------- 小屏 ---------- */
@media (max-width: 767px) {
  .users-head {
    flex-wrap: wrap;
  }

  .users-head__search {
    flex: 1;
  }

  .users-head__input {
    width: 100%;
  }

  .user-row {
    padding: 12px;
  }

  .user-row__name {
    max-width: 130px;
  }

  .user-row__side {
    display: none;
  }
}

/* 处罚状态标签：红色是封号、琥珀色是禁言，鼠标悬停能看到理由 */
.ban-chip {
  display: inline-flex;
  align-items: center;
  height: 20px;
  margin-top: 4px;
  padding: 0 8px;
  border-radius: 6px;
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
  font-size: 0.72rem;
  line-height: 1;
  white-space: nowrap;
}

/* 解封：与「外观」同一尺寸，但用红色描边表明是撤销性质的操作 */
.user-row__unban {
  color: #ef4444;
  border-color: rgba(239, 68, 68, 0.38);
}

.user-row__unban:hover {
  border-color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

/* 封号按钮：比「禁言」重一档，用琥珀色提醒下手别太重 */
.user-row__ban {
  color: #d97706;
  border-color: rgba(217, 119, 6, 0.35);
}

.user-row__ban:hover:not(:disabled) {
  border-color: #d97706;
  background: rgba(217, 119, 6, 0.1);
  color: #d97706;
}

.user-row__style-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.user-row__style-btn:disabled:hover {
  border-color: var(--border-color);
  background: transparent;
  color: var(--text-secondary);
}

/* 禁言用琥珀色，封号保留红色：一眼能分出轻重 */
/* 未验证：中性灰。它不是处罚，只是「还没解锁发言」 */
.verify-chip {
  color: var(--text-secondary);
  background: var(--bg-nomarl);
  border: 1px solid var(--border-color);
}

.ban-chip--mute {
  background: rgba(217, 119, 6, 0.12);
  color: #d97706;
}

/* ---------- 处罚面板 ---------- */
.punish-panel {
  max-width: 400px;
}

.punish-level {
  display: flex;
  gap: 3px;
  margin: 4px 0 10px;
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

/* 暗色下 --bg-primary 比底盘更深，选中项会显得凹陷 → 换一层浅白 */
:global(:root.dark .punish-level__item.is-on) {
  background: rgba(255, 255, 255, 0.09);
  box-shadow: none;
}

.punish-level__name {
  font-size: 0.83rem;
  font-weight: 600;
}

.punish-level__desc {
  font-size: 0.72rem;
  color: var(--text-secondary);
}

.punish-days {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.punish-days__item {
  height: 28px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.78rem;
  font-family: inherit;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    color 0.15s ease,
    background 0.15s ease;
}

.punish-days__item:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.punish-days__item.is-on {
  border-color: var(--primary-color);
  background: var(--primary-color-soft);
  color: var(--primary-color);
}

.punish-reason {
  width: 100%;
  margin-bottom: 10px;
}
</style>
