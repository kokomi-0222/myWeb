package com.example.kokomi.dto;

import lombok.Data;

/**
 * 注册第 2 步里 **RSA 密文**解出来的东西 —— 只有密码两项。
 * <p>
 * 为什么只剩密码：RSA-1024 用 PKCS#1 v1.5 一块最多 117 字节，而用户名默认是
 * 邮箱地址（最长 50 字符），整包塞进去必超长，前端 JSEncrypt 会直接加密失败；
 * 它还是按字节加密的，中文用户名 `charCode > 255` 会被截成乱码。
 * 所以 ticket / 用户名走明文（HTTPS 兜住），只有密码加密。
 * <p>
 * 真正从请求体进来的字段在 {@link RegisterFormDTO}：`ticket` + `account` + `encryptedData`。
 */
@Data
public class RegisterDTO {
    private String password;
    private String confirmPassword;
}
