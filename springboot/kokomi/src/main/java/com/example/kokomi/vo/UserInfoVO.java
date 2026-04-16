package com.example.kokomi.vo;

import com.example.kokomi.bo.UserBO;
import com.example.kokomi.util.JwtUtil;
import lombok.Data;

import java.util.List;

@Data
public class UserInfoVO {
    private UserVO user;       // 用户信息
    private List<String> roles;    // 角色
    private List<String> permissions; // 权限


    /**
     * 标准转换：BO → VO
     * 统一在这里封装
     */
    public static UserInfoVO fromUserBO(UserBO bo) {
        UserInfoVO vo = new UserInfoVO();

        // 用户信息转换
        UserVO userVO = new UserVO();
        userVO.setId(bo.getId());
        userVO.setUsername(bo.getUsername());
        userVO.setName(bo.getName());
        userVO.setNameColor(bo.getNameColor());
        userVO.setPrimaryRole(bo.getPrimaryRole());
        userVO.setAvatar(bo.getAvatar());
        userVO.setBadge(bo.getBadge());
        userVO.setOrnament(bo.getOrnament());
        userVO.setBirthday(bo.getBirthday());
        userVO.setEmail(bo.getEmail());
        userVO.setGender(bo.getGender());
        userVO.setPhone(bo.getPhone());
        userVO.setSignature(bo.getSignature());

        // 角色 + 权限
        vo.setUser(userVO);
        vo.setRoles(bo.getRoles());
        vo.setPermissions(bo.getPermissions());

        return vo;
    }
}
