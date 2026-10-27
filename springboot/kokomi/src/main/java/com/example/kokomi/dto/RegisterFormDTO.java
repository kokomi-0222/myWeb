package com.example.kokomi.dto;

import lombok.Data;

/**
 * 注册第二步的请求（用户名 + 密码）。
 *
 * <p>注册拆成了两步：
 * <ol>
 *   <li>POST /user/register/verify-email：邮箱 + 验证码 → 返回 ticket；</li>
 *   <li>POST /user/register：本 DTO，凭 ticket 建号，邮箱直接落成已验证。</li>
 * </ol>
 *
 * <p>为什么不复用登录那套「整个表单塞进 encryptedData」：
 * RSA-1024 用 PKCS#1 v1.5 时，一块最多装 117 字节，用户名默认是邮箱（最长 50）
 * 加上密码两项，随便填填就 130 字节往上 —— 前端 JSEncrypt 会直接加密失败，
 * 用户只看到「密码加密失败」。另外 RSA 按字节加密，中文用户名会被截断成乱码。
 * <p>
 * 所以只有**密码**走 RSA（{"password","confirmPassword"}，撑死 90 字节），
 * 用户名走明文：它不是机密，HTTPS 已经兜住了。
 */
@Data
public class RegisterFormDTO {
    /** 第一步验完邮箱拿到的凭证（10 分钟有效） */
    private String ticket;
    /** 用户名，2~50；默认是邮箱地址，也可以改成别的 */
    private String account;
    /** RSA 加密的 {"password","confirmPassword"} */
    private String encryptedData;
}
