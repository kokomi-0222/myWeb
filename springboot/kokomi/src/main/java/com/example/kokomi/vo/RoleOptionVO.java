package com.example.kokomi.vo;

import lombok.Data;

/**
 * 公开的角色字典（编码 + 显示名）。
 * 帖子、主页上的身份标签靠它把 roleCode 翻成中文，
 * 所以必须免登录可访问（匿名访客也要看得到「版主」两个字）。
 */
@Data
public class RoleOptionVO {
    private String code;
    private String name;

    public static RoleOptionVO of(String code, String name) {
        RoleOptionVO vo = new RoleOptionVO();
        vo.setCode(code);
        vo.setName(name);
        return vo;
    }
}
