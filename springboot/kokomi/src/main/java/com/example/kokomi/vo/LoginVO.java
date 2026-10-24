package com.example.kokomi.vo;

import java.util.List;

import com.example.kokomi.bo.UserBO;
import com.example.kokomi.util.JwtUtil;

import lombok.Data;

@Data
public class LoginVO {
    private String token;          // JWT token
    private UserVO user;       // 用户信息
    private List<String> roles;    // 角色
    private List<String> permissions; // 权限

    /**
     * 标准转换：BO → VO
     * 统一在这里封装
     */
    public static LoginVO fromUserBO(UserBO bo) {
        LoginVO vo = new LoginVO();
        vo.setToken(JwtUtil.generateToken(bo.getId(), bo.getTokenVersion()));
        vo.setUser(UserVO.fromBO(bo));
        vo.setRoles(bo.getRoles());
        vo.setPermissions(bo.getPermissions());
        return vo;
    }
}
