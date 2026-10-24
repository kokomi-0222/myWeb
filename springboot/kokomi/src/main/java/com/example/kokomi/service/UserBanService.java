package com.example.kokomi.service;

/**
 * 账号处罚（禁言 / 封号）。
 * <p>
 * 抽成独立服务，是因为有两个入口要处罚人：
 * <ul>
 *   <li>后台处理举报时「顺手处罚作者」</li>
 *   <li>用户管理页直接对某个账号下手</li>
 * </ul>
 * 保护规则（不能罚自己、不能罚管理员）和缓存失效必须两边完全一致，
 * 复制一份迟早会走样。
 */
public interface UserBanService {

    /**
     * 处罚某个用户。
     *
     * @param targetId 被处罚人
     * @param level    {@link com.example.kokomi.common.BanLevel#MUTE} 或 {@code BAN}
     * @param days     正数按天，-1 或 null 表示永久
     * @param reason   理由（会给本人看到，留空则用默认文案）
     * @return 被处罚人的昵称（给处理备注用）
     */
    String punish(Long targetId, int level, Integer days, String reason);

    /** 解除处罚（禁言和封号共用，解完恢复正常） */
    void release(Long targetId);

    /**
     * 发言前检查：被禁言 / 被封号的人不能发帖、评论、回复。
     * <p>
     * 顺带处理「临时处罚已到期」的情况——到点了直接放行，不用等别人来点解封。
     * 放在发帖这种低频写操作上，一次主键查询的开销可以忽略。
     */
    void checkCanSpeak(Long userId);
}
