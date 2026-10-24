package com.example.kokomi.controller;

import com.example.kokomi.common.Result;
import com.example.kokomi.service.AdminRoleService;
import com.example.kokomi.vo.RoleOptionVO;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 角色字典（公开）。
 * <p>
 * 前台的身份标签是拿 article 里的 roleCode（primaryRole）翻中文的，
 * 匿名访客刷首页也要显示「版主」，所以这个接口必须免登录，
 * 并且要在 application.yaml 的 auth.excludePaths 里放行。
 */
@RestController
@RequestMapping("/role")
@RequiredArgsConstructor
public class RoleController {

    private final AdminRoleService adminRoleService;

    @GetMapping("/list")
    public Result<List<RoleOptionVO>> list() {
        return Result.success(adminRoleService.options());
    }
}
