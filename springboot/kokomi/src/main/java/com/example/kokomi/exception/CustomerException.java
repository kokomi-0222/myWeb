package com.example.kokomi.exception;

import com.example.kokomi.common.ResultCode;

public class CustomerException extends RuntimeException {

    private final int code;

    // 只传消息，默认使用 500服务器错误
    public CustomerException(String message) {
        super(message);
        this.code = ResultCode.SERVER_ERROR;
    }

    // 可自定义错误码
    public CustomerException(int code, String message) {
        super(message);
        this.code = code;
    }

    public int getCode() {
        return code;
    }
}