package com.example.kokomi.controller;

import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.example.kokomi.common.Result;
import com.example.kokomi.dto.CreateReportDTO;
import com.example.kokomi.service.ReportService;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

/**
 * 举报（用户侧）。
 * <p>
 * 这三个接口都要求登录，但<b>不要求任何权限码</b>——举报是用户的正当权利。
 */
@RestController
@RequestMapping("/report")
@RequiredArgsConstructor
public class ReportController {

    private final ReportService reportService;

    /** 举报理由字典：前端弹窗直接渲染，加理由不用发前端版 */
    @GetMapping("/reasons")
    public Result<Map<String, String>> reasons() {
        return Result.success(reportService.reasons());
    }

    /** 提交举报 */
    @PostMapping
    public Result<Long> create(@Valid @RequestBody CreateReportDTO dto) {
        return Result.success(reportService.create(dto), "举报已提交，我们会尽快处理");
    }

    /**
     * 我在某类对象上还没处理完的举报目标。
     * 前端用它把菜单里的「举报」显示成「已举报，处理中」，避免重复提交撞报错。
     */
    @GetMapping("/mine")
    public Result<List<Long>> mine(@RequestParam String targetType) {
        return Result.success(reportService.myPendingTargetIds(targetType));
    }
}
