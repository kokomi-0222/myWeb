// utils/postActions.js
import { usePermission } from "@/utils/usePermission";
import { copyPostLink } from "@/utils/sharePost";
/**
 * 所有可用的操作项
 * 每个 action 可以通过 requiredPermission 控制是否显示
 */
export const ALL_ACTIONS = [
  // —— 自己的帖子 ——
  {
    key: 'edit',
    label: '编辑',
    requiredPermission: ({ isOwnPost }) => isOwnPost,
    handler: () => {
      // 待实现：跳转编辑页（复用发布框，回填原内容）
    }
  },
  {
    key: 'delete',
    label: '删除',
    requiredPermission: ({ isOwnPost }) => isOwnPost,
    danger: true,
    handler: () => {}
  },

  // —— 他人的帖子 ——
  {
    key: 'report',
    label: '举报',
    requiredPermission: 'post:report', // 需要该权限
    handler: () => {
      // 待实现：举报弹窗 / 提交流程
    }
  },
  {
    key: 'block',
    label: '拉黑作者',
    requiredPermission: 'user:block',
    handler: () => {
      // 待实现：拉黑作者
    }
  },

  // —— 所有人都能操作 ——
  {
    key: 'share',
    label: '分享',
    requiredPermission: () => true,
    // 分享的唯一动作：把帖子链接复制到剪贴板（见 utils/sharePost.js）。
    // PostCard 会提前拦截 key === 'share'，这里保持同样的实现，
    // 保证任何直接调用 handler 的地方行为一致。
    handler: (post) => copyPostLink(post)
  },

  // —— 管理员专属 ——
  {
    key: 'adminDelete',
    label: '强制删除',
    requiredPermission: ({ isOwnPost }) => !isOwnPost && usePermission().hasPermission('post:delete'),
    danger: true,
    handler: () => {}
  }
]
