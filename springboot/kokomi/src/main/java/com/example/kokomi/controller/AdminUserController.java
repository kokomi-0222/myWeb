package com.example.kokomi.controller;

import com.example.kokomi.annotation.RequirePermission;
import com.example.kokomi.common.Result;
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
 * 三个接口都挂了 @RequirePermission("user:manage")，
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
}
