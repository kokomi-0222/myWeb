package com.example.kokomi.vo;

import com.example.kokomi.bo.UserBO;
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
        vo.setUser(UserVO.fromBO(bo));
        vo.setRoles(bo.getRoles());
        vo.setPermissions(bo.getPermissions());
        return vo;
    }
}
