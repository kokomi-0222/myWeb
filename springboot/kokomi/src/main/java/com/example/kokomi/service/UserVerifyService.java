package com.example.kokomi.service;

import com.example.kokomi.vo.VerifySendVO;

/**
 * 邮箱相关的动作分四类：注册时验邮箱、补绑、换绑、解绑，外加找回密码。
 *
 * <p>站内的等级是「游客 → 普通用户 → 会员」：
 * <ul>
 *   <li><b>注册不产生游客</b>：邮箱在注册时必须验证通过，新号落地即 member，
 *       发帖评论都通，不存在「刚注册什么都干不了」的空窗期；</li>
 *   <li>guest 现在只剩「升级前注册、至今没绑邮箱的存量账号」和「管理员手动降级」
 *       两种来源，权限码是空的；</li>
 *   <li>会员（vip）由管理员在后台授予，权限和 member 一样，留着当以后的特权档。</li>
 * </ul>
 *
 * <p><b>解绑是允许的，但必须验当前密码</b>：解绑只丢掉「用邮箱找回密码」这一条后路，
 * 账号本身照常用（角色不回收，发帖评论不受影响）。要密码是因为它能改写找回凭据 ——
 * 只有拿到登录态、又不知道密码的人，才不能把邮箱换成自己的再重置密码接管账号。
 *
 * <p>发帖/评论的闸门在 PostServiceImpl / CommentServiceImpl 里按权限码判断，
 * 和邮箱没有直接关系 —— 所以解绑不会让人发不出内容。
 */
public interface UserVerifyService {

    // ------------------------------------------------------------------
    // 注册：邮箱验证码（免登录，全站唯一的公开发信入口）
    // ------------------------------------------------------------------

    /**
     * 注册第一步：给邮箱发验证码。不需要登录。
     * <p>
     * 与「绑定」不同，这里邮箱被占用要**直接报错**：注册场景下瞒着用户没有意义，
     * 他填完码提交还是会失败，不如在发码这一步就说清楚「该邮箱已被注册」。
     */
    VerifySendVO sendRegisterCode(String email);

    /**
     * 注册第一步的后半：校验邮箱验证码，通过后发一张 ticket 给第二步用。
     * <p>
     * 为什么不把验证码留到第二步一起交：{@link com.example.kokomi.util.EmailCodeCache}
     * 命中即消费，第二步要是因为「用户名被占用」失败一次，用户就得重新收一封邮件。
     * ticket 只绑定邮箱、10 分钟有效，失败可以拿同一张重试。
     *
     * @return ticket，注册第二步（POST /user/register）带上它
     */
    String verifyRegisterEmail(String email, String code);

    // ------------------------------------------------------------------
    // 绑定（存量游客补绑）
    // ------------------------------------------------------------------

    /**
     * 给用户发验证码。
     *
     * @param email 要绑定的邮箱；传 null/空 表示用账号上已有的邮箱
     *              （老账号以前填过但没验证的情况）。
     */
    VerifySendVO sendCode(Long userId, String email);

    /** 校验验证码；通过后写入 email、email_verified=1，是游客的话升成普通用户 */
    void confirm(Long userId, String email, String code);

    /** 管理端手动标记为已验证（SMTP 出故障时给用户兜底）。邮箱为空时会被拒绝，见实现 */
    void markVerified(Long userId);

    boolean isVerified(Long userId);

    // ------------------------------------------------------------------
    // 换绑：替代原来的「解绑」
    // ------------------------------------------------------------------

    /**
     * 换绑第一步：验证当前密码，然后给**新邮箱**发验证码。
     * <p>
     * 为什么要密码：换绑等于换掉「找回密码」的凭据。如果不验密码，
     * 任何拿到登录态的人（共用电脑没退、token 泄露）都能把邮箱换成自己的，
     * 再走一遍「忘记密码」改掉密码 —— 那就是完整的账号接管。
     * 这一步是换绑唯一的身份复核点。
     */
    VerifySendVO sendChangeCode(Long userId, String email, String encryptedData);

    /**
     * 换绑第二步：新邮箱 + 验证码。
     * <p>
     * 成功后 email 换成新的、email_verified 保持 1，**角色一概不动** ——
     * 换邮箱是换联系方式，不是换身份。
     */
    void confirmChange(Long userId, String email, String code);

    // ------------------------------------------------------------------
    // 解绑：丢掉邮箱 = 放弃「用邮箱找回密码」，账号本身不受影响
    // ------------------------------------------------------------------

    /**
     * 解绑邮箱：清空 email + 把验证位归零，**角色一概不动**。
     * <p>
     * 必须验当前密码（和换绑同一条理由）：它改写的是找回密码的凭据。
     * 解绑之后角色仍是 member，发帖 / 评论 / 举报一切照旧 —— 能不能发言看的是
     * 权限码，不是 email_verified（见 PostServiceImpl#checkCanPost）。
     * 唯一的代价是：不能再走「忘记密码」，只能记得住密码继续登录。
     *
     * @param encryptedData RSA 加密的 {oldPassword}
     */
    void unbind(Long userId, String encryptedData);

    // ------------------------------------------------------------------
    // 找回密码：入口在登录弹窗的「忘记密码？」，不依赖登录态
    // ------------------------------------------------------------------

    /**
     * 给「已绑定的邮箱」发重置密码验证码。
     * <p>
     * 查不到已验证的账号就直接报「该邮箱没有绑定账号」，不假装已发送 ——
     * 早期版本对谁都回同一句以防枚举，但注册接口本来就会明说「该邮箱已被注册」，
     * 那层防御早就是纸糊的，真实代价只是让解绑过邮箱的人对着收件箱干等。
     * 详见 {@code UserVerifyServiceImpl#sendResetCode}。
     */
    VerifySendVO sendResetCode(String email);

    /**
     * 找回密码第 1 步（界面分两步）：只校验邮箱验证码，不改任何东西。
     * <p>
     * 前端「下一步」调它，通过了才让用户填新密码 —— 和注册第 1 步（验邮箱换 ticket）
     * 是同一个节奏：先把邮箱这块确认掉，第 2 步只剩密码。
     * <p>
     * 只验不消费，也不查账号：第 2 步 {@link #resetPassword} 还要拿同一个码再验一次；
     * 查账号会把「这个邮箱有没有人用」提前漏给第 1 步。
     */
    void verifyResetCode(String email, String code);

    /**
     * 用邮箱验证码重置密码。
     * <p>
     * 成功后 password 换成新哈希、token_version + 1（其它设备上的登录全部失效）——
     * 找回密码的常见场景就是「号被别人登着」，不踢下线等于没找回。
     *
     * @param email         邮箱，必须和发码时一致
     * @param code          6 位验证码
     * @param encryptedData RSA 加密后的 {newPassword, confirmPassword}
     */
    void resetPassword(String email, String code, String encryptedData);
}
