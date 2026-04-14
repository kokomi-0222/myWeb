package com.example.kokomi.common;

import lombok.Data;

@Data
public class Result<T> {

    private Integer code;
    private String msg;
    private T data;

    public static <T> Result<T> success() {
        Result<T> r = new Result<>();
        r.setCode(ResultCode.SUCCESS);
        r.setMsg("success");
        return r;
    }

    public static <T> Result<T> success(T data) {
        Result<T> r = new Result<>();
        r.setCode(ResultCode.SUCCESS);
        r.setMsg("success");
        r.setData(data);
        return r;
    }

    public static <T> Result<T> success(T data, String msg) {
        Result<T> r = new Result<>();
        r.setCode(ResultCode.SUCCESS);
        r.setMsg(msg);
        r.setData(data);
        return r;
    }

    public static <T> Result<T> error(String msg) {
        return error(ResultCode.SERVER_ERROR, msg);
    }

    public static <T> Result<T> error(Integer code, String msg) {
        Result<T> r = new Result<>();
        r.setCode(code);
        r.setMsg(msg);
        return r;
    }
}