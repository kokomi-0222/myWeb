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

    // RSA 加密解密
    public static final int RSA_ENCRYPT_ERROR = 1001;
    public static final int RSA_DECRYPT_ERROR = 1002;

    //


}