package com.example.kokomi.controller;

import com.example.kokomi.annotation.RequirePermission;
import com.example.kokomi.common.Result;
import com.example.kokomi.dto.AdminPunishDTO;
import com.example.kokomi.dto.UpdateUserRolesDTO;
import com.example.kokomi.dto.UpdateUserStyleDTO;
import com.example.kokomi.service.AdminUserService;
import com.example.kokomi.vo.AdminUserVO;
import com.example.kokomi.vo.PageVO;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 用户管理（管理员专用）。
 * 所有接口都挂了 @RequirePermission("user:manage")，
 * 普通用户即使猜到路径也调不动。
 */
@RestController
@RequestMapping("/admin")
@RequiredArgsConstructor
public class AdminUserController {

    private final AdminUserService adminUserService;

    /** 用户列表：支持按账号 / 昵称 / 邮箱搜索，分页返回，带每人当前角色 */
    @GetMapping("/users")
    @RequirePermission(value = "user:manage", message = "只有管理员可以管理用户")
    public Result<PageVO<AdminUserVO>> users(
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "1") Integer pageNum,
            @RequestParam(defaultValue = "20") Integer pageSize) {
        return Result.success(adminUserService.page(keyword, pageNum, pageSize));
    }

    /** 可选角色字典 */
    @GetMapping("/roles")
    @RequirePermission(value = "user:manage", message = "只有管理员可以管理用户")
    public Result<List<String>> roles() {
        return Result.success(adminUserService.listRoles());
    }

    /** 整体覆盖某个用户的角色 */
    @PutMapping("/user/{id}/roles")
    @RequirePermission(value = "user:manage", message = "只有管理员可以管理用户")
    public Result<Void> updateRoles(@PathVariable Long id,
                                    @Valid @RequestBody UpdateUserRolesDTO dto) {
        adminUserService.updateRoles(id, dto.getRoles());
        return Result.success(null, "角色已更新");
    }

    /** 设置某个用户的名字颜色 / 身份标签底色（空值 = 恢复默认） */
    @PutMapping("/user/{id}/style")
    @RequirePermission(value = "user:manage", message = "只有管理员可以设置用户外观")
    public Result<Void> updateStyle(@PathVariable Long id,
                                    @Valid @RequestBody UpdateUserStyleDTO dto) {
        adminUserService.updateStyle(id, dto);
        return Result.success(null, "外观已更新");
    }

    /**
     * 处罚某个用户。
     * <p>
     * 两种力度：禁言（能登录、不能发帖评论）/ 封号（不能登录）。
     * 举报处理页也能顺手做这件事，这个接口是给「不经过举报、管理员主动处理」准备的。
     */
    @PostMapping("/user/{id}/punish")
    @RequirePermission(value = "user:manage", message = "只有管理员可以处罚用户")
    public Result<Void> punish(@PathVariable Long id, @Valid @RequestBody AdminPunishDTO dto) {
        adminUserService.punish(id, dto);
        return Result.success(null, "已处理");
    }

    /**
     * 解除处罚（禁言、封号都走这里）。
     * <p>
     * 永久处罚没有自动到期，必须留一个手动撤销的入口，否则只能去改数据库。
     */
    @PostMapping("/user/{id}/unban")
    @RequirePermission(value = "user:manage", message = "只有管理员可以解除处罚")
    public Result<Void> unban(@PathVariable Long id) {
        adminUserService.unban(id);
        return Result.success(null, "已解除");
    }

    /**
     * 手动把邮箱标记为已验证（发信服务故障时的兜底）。
     */
    @PostMapping("/user/{id}/verify")
    @RequirePermission(value = "user:manage", message = "只有管理员可以激活账号")
    public Result<Void> verifyEmail(@PathVariable Long id) {
        adminUserService.markEmailVerified(id);
        return Result.success(null, "邮箱已标记为已验证");
    }
}
