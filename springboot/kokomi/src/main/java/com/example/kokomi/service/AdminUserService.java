package com.example.kokomi.service;

import com.example.kokomi.vo.AdminUserVO;
import com.example.kokomi.vo.PageVO;

import java.util.List;

/**
 * 用户管理（仅管理员可用）：查用户、改角色。
 */
public interface AdminUserService {

    /** 分页查用户，keyword 匹配账号 / 昵称 / 邮箱 */
    PageVO<AdminUserVO> page(String keyword, Integer pageNum, Integer pageSize);

    /** 可选角色列表（role 表里的全部编码） */
    List<String> listRoles();

    /** 整体覆盖某个用户的角色 */
    void updateRoles(Long userId, List<String> roles);

    /** 设置某个用户的外观光效：名字颜色 + 身份标签底色（空表示恢复默认） */
    void updateStyle(Long userId, com.example.kokomi.dto.UpdateUserStyleDTO dto);
}
