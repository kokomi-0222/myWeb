package com.example.kokomi.common;

public class ResultCode {

    // 成功
    public static final int SUCCESS = 200;

    // 通用错误
    public static final int PARAM_ERROR = 400;         // 参数错误
    public static final int AUTHOR_ERROR = 401;          //权限错误
    public static final int NO_PERMISSION = 403;       // 无权限
    public static final int SERVER_ERROR = 500;        // 服务器异常

    // 业务错误
    public static final int LOGIN_ERROR = 501;        // 登录失败（账号/密码错误）
    public static final int REGISTER_ERROR = 502;     // 注册失败（已存在/校验失败）
    public static final int UPDATE_USER_ERROR = 503;  // 更新用户信息失败
    public static final int UPDATE_PASSWORD_ERROR = 504; //修改密码失败

    // 验证码
    public static final int CAPTCHA_ERROR = 505;

    // 账号被禁言（还能登录，但不能发内容）
    // 单独一个码是为了让前端能分辨「没权限」和「被禁言」：
    // 前者可能只是角色不够，后者要立刻把发布框换成提示条。
    public static final int MUTED = 506;

    // 邮箱未验证 / 还是游客：能登录、能浏览、能点赞，但不能评论 / 举报。
    // 和 MUTED 分开是为了让前端提示不同的引导（一个让等解禁，一个让去绑定邮箱）。
    public static final int EMAIL_UNVERIFIED = 507;

    // 邮箱验证码错误 / 过期 / 试错次数用完
    public static final int VERIFY_CODE_ERROR = 508;

    // 等级不够发帖：游客和普通用户都没有 post:create，只有会员（vip）及以上有。
    // 和 507 分开是因为处理动作完全不同 —— 507 用户自己能解决（去绑邮箱），
    // 509 只能等管理员在后台改成「会员」，前端不该给一个点了没用的按钮。
    public static final int NEED_VIP = 509;

    // RSA 加密解密
    public static final int RSA_ENCRYPT_ERROR = 1001;
    public static final int RSA_DECRYPT_ERROR = 1002;

    //


}