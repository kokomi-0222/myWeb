package com.example.kokomi.common;

public class ResultCode {
    // 成功
    public static final int SUCCESS = 200;

    // 自定义业务异常
    public static final int LOGIN_ERROR = 401;       // 登录失败
    public static final int PARAM_ERROR = 400;       // 参数错误
    public static final int NO_PERMISSION = 403;      // 无权限
    public static final int SERVER_ERROR = 500;      // 服务器错误
}