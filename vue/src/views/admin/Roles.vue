<template>
  <div class="roles-page">
    <!-- 头部 -->
    <div class="roles-head">
      <div class="roles-head__left">
        <span class="roles-head__count">{{ roles.length }} 个角色</span>
        <p class="roles-head__tip">
          角色 = 一组权限。先建角色、勾上它该有的权限，再到「用户管理」把角色点给某个人就生效。
        </p>
      </div>
      <Button type="bilibili" class="admin-btn admin-btn--lead" @click="startCreate">新建角色</Button>
    </div>

    <div v-if="loading && roles.length === 0" class="roles-loading">加载中…</div>

    <div v-else class="roles-layout">
      <!-- 左：角色列表 -->
      <ul class="role-list">
        <li
          v-for="r in roles"
          :key="r.roleCode"
          class="role-item"
          :class="{ 'is-active': !draft?.isNew && draft?.roleCode === r.roleCode }"
          @click="selectRole(r)"
        >
          <div class="role-item__top">
            <span class="role-item__name">{{ r.roleName }}</span>
            <span v-if="r.isSystem" class="role-item__sys">内置</span>
          </div>
          <div class="role-item__meta">
            <span>{{ r.permissions?.length || 0 }} 项权限</span>
            <span class="role-item__dot">·</span>
            <span>{{ r.userCount || 0 }} 人</span>
          </div>
        </li>
      </ul>

      <!-- 右：编辑区 -->
      <section v-if="draft" class="role-panel">
        <div class="role-panel__head">
          <input
            v-model="draft.roleName"
            class="role-panel__name"
            type="text"
            maxlength="30"
            title="点击可改名"
            placeholder="角色名称，例如「审核员」"
          />
          <span v-if="currentRole?.isSystem" class="role-tag">系统内置</span>
          <span v-else-if="draft.isNew" class="role-tag is-new">新角色</span>
        </div>

        <p v-if="!draft.isNew" class="role-panel__code">
          编码 <code>{{ draft.roleCode }}</code> —— 建好后不能改，权限缓存和用户角色都按它索引。
        </p>

        <input
          v-model="draft.description"
          class="role-panel__desc"
          type="text"
          maxlength="200"
          placeholder="一句话说明这个角色能干什么（选填）"
        />

        <div class="perm-groups">
          <div v-for="g in groups" :key="g.name" class="perm-group">
            <div class="perm-group__title">
              <span>{{ g.name }}</span>
              <button
                type="button"
                class="perm-group__all"
                @click="toggleGroup(g)"
              >
                {{ groupAllChecked(g) ? "全不选" : "全选" }}
              </button>
            </div>
            <div class="perm-group__items">
              <button
                v-for="p in g.items"
                :key="p.permCode"
                type="button"
                class="perm-chip"
                :class="{ 'is-on': draft.permissions.includes(p.permCode) }"
                :title="p.permCode"
                @click="togglePerm(p.permCode)"
              >
                <span class="perm-chip__box">
                  <svg viewBox="0 0 12 12" width="9" height="9" aria-hidden="true">
                    <path
                      d="M2 6.2 4.6 8.8 10 3.4"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </span>
                <span class="perm-chip__text">{{ p.permName }}</span>
                <span v-if="!ENFORCED_PERMS.has(p.permCode)" class="perm-chip__off">
                  未启用
                </span>
              </button>
            </div>
          </div>
          <p v-if="groups.length === 0" class="perm-empty">权限字典是空的，先执行 sql_role_manage.sql</p>
          <p class="perm-note">
            标「未启用」的权限，后端对应功能还没做（例如「封禁用户」这类操作还没有入口），
            勾上暂时不会有反应。目前真正在生效的是「删除他人帖子」「新建话题」「管理后台」。
          </p>
        </div>

        <p v-if="lockHint" class="role-panel__hint">{{ lockHint }}</p>

        <footer class="role-panel__foot">
          <button
            v-if="!draft.isNew && !currentRole?.isSystem"
            type="button"
            class="role-danger"
            :disabled="saving"
            @click="removeRole"
          >
            删除角色
          </button>
          <div class="role-panel__foot-right">
            <button
              type="button"
              class="role-ghost"
              :disabled="saving"
              @click="resetDraft"
            >
              放弃修改
            </button>
            <Button type="bilibili" class="admin-btn" :disabled="saving" @click="save">
              {{ saving ? "保存中…" : "保存" }}
            </Button>
          </div>
        </footer>
      </section>

      <div v-else class="roles-empty">在左边选一个角色，或者点右上角新建一个</div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from "vue";
import { ElMessageBox } from "element-plus";
import {
  getAdminRoleList,
  getAdminPermissionList,
  createAdminRole,
  updateAdminRole,
  deleteAdminRole,
} from "@/api/admin";
import { useRoleStore } from "@/stores/role";
import message from "@/utils/message";

const roleStore = useRoleStore();

/**
 * 后端代码里真的会校验的权限码（@RequirePermission 或 Service 里的 hasPermission）。
 * 其余几项是先占好位的字典项，勾了不会改变任何行为 —— 页面上标「未启用」，
 * 免得站长以为给了权限却「怎么还是不行」。
 * 后端新增校验时，这里同步加一个码。
 */
const ENFORCED_PERMS = new Set(["post:delete", "topic:create", "user:manage"]);

const roles = ref([]);
const permissionDict = ref([]);
const loading = ref(false);
const saving = ref(false);

/**
 * 正在编辑的角色。新建和编辑共用一个表单：
 * isNew 为真时是草稿，保存走 POST；否则是某个已有角色，保存走 PUT。
 */
const draft = ref(null);

const currentRole = computed(() =>
  draft.value && !draft.value.isNew
    ? roles.value.find((r) => r.roleCode === draft.value.roleCode) || null
    : null
);

/** 权限按 permGroup 分组，组顺序跟后端 sort 走 */
const groups = computed(() => {
  const map = new Map();
  for (const p of permissionDict.value) {
    const key = p.permGroup || "其它";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  }
  return [...map.entries()].map(([name, items]) => ({ name, items }));
});

/** 「管理员」必须保留管理后台权限，勾掉就等于把所有人锁在门外 */
const lockHint = computed(() => {
  if (draft.value?.isNew || draft.value?.roleCode !== "admin") return "";
  return draft.value.permissions.includes("user:manage")
    ? ""
    : "取消「管理后台」后，包括你在内没有任何人能进入后台。保存会被拒绝。";
});

const load = async () => {
  loading.value = true;
  try {
    const [roleRes, permRes] = await Promise.all([
      getAdminRoleList(),
      getAdminPermissionList(),
    ]);
    roles.value = Array.isArray(roleRes.data) ? roleRes.data : [];
    permissionDict.value = Array.isArray(permRes.data) ? permRes.data : [];
  } catch {
    roles.value = [];
  } finally {
    loading.value = false;
  }
};

const fillDraft = (r) => {
  draft.value = {
    isNew: false,
    roleCode: r.roleCode,
    roleName: r.roleName,
    description: r.description || "",
    permissions: [...(r.permissions || [])],
  };
};

/** 有未保存的改动时切角色要确认一下，免得白改 */
const isDirty = computed(() => {
  const d = draft.value;
  if (!d) return false;
  if (d.isNew) return !!(d.roleName.trim() || d.description.trim() || d.permissions.length);
  const src = currentRole.value;
  if (!src) return false;
  const same =
    d.roleName === src.roleName &&
    d.description === (src.description || "") &&
    d.permissions.length === (src.permissions || []).length &&
    d.permissions.every((p) => (src.permissions || []).includes(p));
  return !same;
});

const selectRole = async (r) => {
  if (draft.value?.roleCode === r.roleCode && !draft.value.isNew) return;
  if (isDirty.value) {
    try {
      await ElMessageBox.confirm("当前角色的改动还没保存，切换后会丢失。", "放弃修改？", {
        type: "warning",
        confirmButtonText: "放弃",
        cancelButtonText: "取消",
      });
    } catch {
      return;
    }
  }
  fillDraft(r);
};

const startCreate = () => {
  draft.value = {
    isNew: true,
    roleCode: "",
    roleName: "",
    description: "",
    permissions: [],
  };
};

const resetDraft = () => {
  if (draft.value?.isNew) {
    draft.value = null;
    return;
  }
  const src = currentRole.value;
  if (src) fillDraft(src);
};

const togglePerm = (code) => {
  const list = draft.value.permissions;
  const i = list.indexOf(code);
  if (i >= 0) list.splice(i, 1);
  else list.push(code);
};

const groupAllChecked = (g) =>
  g.items.every((p) => draft.value.permissions.includes(p.permCode));

const toggleGroup = (g) => {
  const all = groupAllChecked(g);
  for (const p of g.items) {
    const i = draft.value.permissions.indexOf(p.permCode);
    if (all && i >= 0) draft.value.permissions.splice(i, 1);
    if (!all && i < 0) draft.value.permissions.push(p.permCode);
  }
};

const save = async () => {
  if (saving.value) return;
  const name = draft.value.roleName.trim();
  if (!name) {
    message.warning("角色名称不能为空");
    return;
  }

  // 前端先挡一道，别等后端报错
  if (draft.value.roleCode === "admin" && !draft.value.permissions.includes("user:manage")) {
    message.warning("「管理员」必须保留「管理后台」权限");
    return;
  }

  saving.value = true;
  try {
    const payload = {
      roleName: name,
      description: draft.value.description.trim(),
      permissions: [...draft.value.permissions],
    };
    const res = draft.value.isNew
      ? await createAdminRole(payload)
      : await updateAdminRole(draft.value.roleCode, payload);

    message.success(draft.value.isNew ? `已创建角色「${name}」` : `已保存「${name}」`);

    const savedCode = res.data?.roleCode || draft.value.roleCode;
    draft.value = null;
    await load();
    const hit = roles.value.find((r) => r.roleCode === savedCode);
    if (hit) fillDraft(hit);

    // 前台的身份标签要跟着换中文名
    roleStore.refresh();
  } catch (err) {
    if (!err?.message) message.error("保存失败");
  } finally {
    saving.value = false;
  }
};

const removeRole = async () => {
  const r = currentRole.value;
  if (!r) return;

  try {
    await ElMessageBox.confirm(
      `删除后「${r.roleName}」会从所有人身上消失，权限也随之失效。`,
      "删除角色",
      {
        type: "warning",
        confirmButtonText: "删除",
        cancelButtonText: "取消",
        customClass: "danger-confirm",
      }
    );
  } catch {
    return;
  }

  try {
    await deleteAdminRole(r.roleCode);
    message.success(`已删除「${r.roleName}」`);
    draft.value = null;
    await load();
    if (roles.value.length) fillDraft(roles.value[0]);
    roleStore.refresh();
  } catch {
    // 后端会说明「还有 N 个人在用」，request 层已 toast
  }
};

onMounted(async () => {
  await load();
  if (roles.value.length) fillDraft(roles.value[0]);
});
</script>

<style scoped>
.roles-page {
  display: flex;
  flex-direction: column;
}

/* ---------- 头部 ---------- */
.roles-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 2px 4px 14px;
}

.roles-head__left {
  min-width: 0;
}

.roles-head__count {
  font-size: 0.8125rem;
  color: var(--text-secondary);
}

.roles-head__tip {
  margin: 4px 0 0;
  font-size: 0.75rem;
  line-height: 1.6;
  color: var(--text-secondary);
}

.roles-loading,
.roles-empty {
  padding: 56px 0;
  text-align: center;
  color: var(--text-secondary);
  font-size: 0.875rem;
}

/* ---------- 两栏 ---------- */
.roles-layout {
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}

.role-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.role-item {
  padding: 11px 12px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-primary);
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.role-item:hover {
  border-color: var(--primary-color);
}

.role-item.is-active {
  border-color: transparent;
  background: var(--primary-color-soft);
}

.role-item__top {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.role-item__name {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.role-item.is-active .role-item__name {
  color: var(--primary-color);
}

.role-item__sys {
  flex-shrink: 0;
  padding: 0 5px;
  border-radius: 4px;
  background: var(--bg-nomarl);
  color: var(--text-secondary);
  font-size: 0.625rem;
  line-height: 15px;
}

.role-item__meta {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  font-size: 0.6875rem;
  color: var(--text-secondary);
}

.role-item__dot {
  opacity: 0.6;
}

/* ---------- 编辑面板 ---------- */
.role-panel {
  padding: 18px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-primary);
}

.role-panel__head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.role-panel__name {
  flex: 1;
  min-width: 0;
  height: 36px;
  padding: 0 11px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: var(--bg-nomarl);
  color: var(--text-primary);
  font-size: 0.9375rem;
  font-weight: 600;
  font-family: inherit;
  outline: none;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.role-panel__name:focus {
  border-color: var(--primary-color);
  background: var(--bg-primary);
}

.role-panel__name::placeholder {
  font-weight: 400;
  color: var(--text-secondary);
}

.role-tag {
  flex-shrink: 0;
  padding: 0 7px;
  border-radius: 5px;
  background: var(--bg-nomarl);
  color: var(--text-secondary);
  font-size: 0.6875rem;
  line-height: 19px;
}

.role-tag.is-new {
  background: var(--primary-color-soft);
  color: var(--primary-color);
}

.role-panel__code {
  margin: 8px 0 0;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.role-panel__code code {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--bg-nomarl);
  font-size: 0.75rem;
  color: var(--text-primary);
}

.role-panel__desc {
  width: 100%;
  height: 34px;
  margin-top: 10px;
  padding: 0 11px;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 0.8125rem;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s ease;
}

.role-panel__desc:focus {
  border-color: var(--primary-color);
}

.role-panel__hint {
  margin: 12px 0 0;
  font-size: 0.75rem;
  line-height: 1.6;
  color: #f5a623;
}

/* ---------- 权限勾选 ---------- */
.perm-groups {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.perm-group__title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.perm-group__all {
  padding: 0;
  border: none;
  background: transparent;
  color: var(--primary-color);
  font-size: 0.6875rem;
  font-family: inherit;
  cursor: pointer;
}

.perm-group__all:hover {
  text-decoration: underline;
}

.perm-group__items {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* 勾选项沿用用户管理页 role-chip 的视觉：胶囊 + 选中主色 */
.perm-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px 0 8px;
  border: 1px solid var(--border-color);
  border-radius: 15px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.8125rem;
  font-family: inherit;
  line-height: 1;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}

.perm-chip:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.perm-chip.is-on {
  background: var(--primary-color-soft);
  border-color: transparent;
  color: var(--primary-color);
  font-weight: 600;
}

.perm-chip__box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  border-radius: 5px;
  /* 未选中时也要看得出是个勾选框，默认的 --border-color 在浅色下太淡 */
  border: 1.5px solid rgba(128, 128, 128, 0.45);
  background: transparent;
  color: transparent;
  flex-shrink: 0;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}

.perm-chip:hover .perm-chip__box {
  border-color: var(--primary-color);
}

.perm-chip.is-on .perm-chip__box {
  border-color: var(--primary-color);
  background: var(--primary-color);
  color: #fff;
}

.perm-empty {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--text-secondary);
}

/* 「未启用」角标：只做提示。用继承色 + 降透明度，
   不额外铺底色 —— 选中态的胶囊本身是浅蓝底，再叠一块灰底会很脏 */
.perm-chip__off {
  padding: 0;
  background: transparent;
  color: inherit;
  opacity: 0.55;
  font-size: 0.625rem;
  font-weight: 400;
  line-height: 15px;
}

.perm-note {
  margin: 2px 0 0;
  font-size: 0.6875rem;
  line-height: 1.65;
  color: var(--text-secondary);
}

/* ---------- 底部 ---------- */
.role-panel__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--border-color);
}

.role-panel__foot-right {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.role-danger {
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: transparent;
  color: #f53f3f;
  font-size: 0.8125rem;
  font-family: inherit;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;
}

.role-danger:hover:not(:disabled) {
  border-color: transparent;
  background: rgba(245, 63, 63, 0.1);
}

.role-danger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 次级按钮自己做：Button 的 default 类型把 --bg-color 写死成 #ebebeb，暗色压不住 */
.role-ghost {
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

.role-ghost:hover:not(:disabled) {
  border-color: var(--primary-color);
  color: var(--primary-color);
  background: var(--primary-color-soft);
}

.role-ghost:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* ---------- 小屏 ---------- */
@media (max-width: 900px) {
  .roles-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  /* 小屏把角色列表压成横向滚动条，省出纵向空间给编辑区 */
  .role-list {
    flex-direction: row;
    overflow-x: auto;
    padding-bottom: 2px;
  }

  .role-item {
    flex-shrink: 0;
    min-width: 140px;
  }

  .roles-head {
    flex-wrap: wrap;
  }

  .role-panel {
    padding: 14px;
  }

  .role-panel__foot {
    flex-wrap: wrap;
  }
}
</style>
