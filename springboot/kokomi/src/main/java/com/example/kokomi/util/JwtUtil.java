package com.example.kokomi.util;

import com.example.kokomi.config.JwtProperties;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.util.Date;

@Component
public class JwtUtil {

    private static JwtProperties jwtProperties;

    @Autowired
    public void setJwtProperties(JwtProperties jwtProperties) {
        JwtUtil.jwtProperties = jwtProperties;
    }

    /**
     * 获取密钥
     */
    private static SecretKey getSecretKey() {
        return Keys.hmacShaKeyFor(jwtProperties.getSecret().getBytes());
    }

    /**
     * 生成 Token
     */
    public static String generateToken(Long userId) {
        return Jwts.builder()
                .setSubject(userId.toString())
                .setExpiration(new Date(System.currentTimeMillis() + jwtProperties.getExpire()))
                .signWith(getSecretKey())  //
                .compact();
    }

    /**
     * 解析 Token 获取 userId
     */
    public static Long getUserId(String token) {
        Claims claims = Jwts.parserBuilder()  // 新版：parserBuilder() 代替 parser()
                .setSigningKey(getSecretKey())
                .build()
                .parseClaimsJws(token)
                .getBody();
        return Long.valueOf(claims.getSubject());
    }

    /**
     * 校验 Token 是否有效
     */
    public static boolean validateToken(String token) {
        try {
            Jwts.parserBuilder()  // 新版
                    .setSigningKey(getSecretKey())
                    .build()
                    .parseClaimsJws(token);
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}