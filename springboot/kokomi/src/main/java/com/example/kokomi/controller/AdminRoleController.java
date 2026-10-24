package com.example.kokomi.controller;

import com.example.kokomi.annotation.RequirePermission;
import com.example.kokomi.common.Result;
import com.example.kokomi.dto.SaveRoleDTO;
import com.example.kokomi.service.AdminRoleService;
import com.example.kokomi.vo.AdminRoleVO;
import com.example.kokomi.vo.PermissionVO;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 角色权限管理（管理后台专用）。
 * <p>
 * 整个 /admin 分区只认一个权限码 {@code user:manage}：能进后台就能管角色，
 * 不再为「管角色」单独造一个码，否则会出现「能进后台却点不动角色页」的怪状态。
 */
@RestController
@RequestMapping("/admin")
@RequiredArgsConstructor
public class AdminRoleController {

    private final AdminRoleService adminRoleService;

    /** 角色列表：每个角色带上已勾选的权限码和名下用户数 */
    @GetMapping("/role/list")
    @RequirePermission(value = "user:manage", message = "只有管理员可以管理角色")
    public Result<List<AdminRoleVO>> list() {
        return Result.success(adminRoleService.list());
    }

    /** 权限字典：后台勾选框的数据源，按 perm_group 分组展示 */
    @GetMapping("/permission/list")
    @RequirePermission(value = "user:manage", message = "只有管理员可以管理角色")
    public Result<List<PermissionVO>> permissions() {
        return Result.success(adminRoleService.permissions());
    }

    /** 新建角色 */
    @PostMapping("/role")
    @RequirePermission(value = "user:manage", message = "只有管理员可以新建角色")
    public Result<AdminRoleVO> create(@Valid @RequestBody SaveRoleDTO dto) {
        return Result.success(adminRoleService.create(dto), "角色已创建");
    }

    /** 修改角色的名字 / 说明 / 权限 */
    @PutMapping("/role/{code}")
    @RequirePermission(value = "user:manage", message = "只有管理员可以修改角色")
    public Result<AdminRoleVO> update(@PathVariable String code,
                                      @Valid @RequestBody SaveRoleDTO dto) {
        return Result.success(adminRoleService.update(code, dto), "角色已保存");
    }

    /** 删除角色（内置角色、还有人用的角色会被拒） */
    @DeleteMapping("/role/{code}")
    @RequirePermission(value = "user:manage", message = "只有管理员可以删除角色")
    public Result<Void> delete(@PathVariable String code) {
        adminRoleService.delete(code);
        return Result.success(null, "角色已删除");
    }
}
