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

    /**
     * 直接处罚某个用户。
     * <p>
     * 和举报处理里的「处罚作者」是同一套逻辑（{@link com.example.kokomi.service.UserBanService}），
     * 区别只是入口不同：这里不需要先有一条举报。
     */
    void punish(Long userId, com.example.kokomi.dto.AdminPunishDTO dto);

    /** 解除处罚（禁言和封号都从这里撤销；永久处罚也只能在这里撤销） */
    void unban(Long userId);
}
