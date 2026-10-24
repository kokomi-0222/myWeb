package com.example.kokomi.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.example.kokomi.annotation.RequirePermission;
import com.example.kokomi.common.Result;
import com.example.kokomi.dto.HandleReportDTO;
import com.example.kokomi.dto.ReportPageQueryDTO;
import com.example.kokomi.service.ReportService;
import com.example.kokomi.vo.PageVO;
import com.example.kokomi.vo.ReportDetailVO;
import com.example.kokomi.vo.ReportVO;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

/**
 * 后台举报处理。
 * <p>
 * 与 /admin 其它接口保持一致，统一用 {@code user:manage} 把关：
 * 「能进后台」就等于「能处理举报」，不额外引入第五个真实权限码。
 */
@RestController
@RequestMapping("/admin/report")
@RequiredArgsConstructor
public class AdminReportController {

    private final ReportService reportService;

    @GetMapping("/list")
    @RequirePermission(value = "user:manage", message = "只有管理员可以查看举报")
    public Result<PageVO<ReportVO>> list(@Valid ReportPageQueryDTO query) {
        return Result.success(reportService.page(query));
    }

    /** 待处理数量，后台菜单徽标用 */
    @GetMapping("/pending-count")
    @RequirePermission(value = "user:manage", message = "只有管理员可以查看举报")
    public Result<Long> pendingCount() {
        return Result.success(reportService.pendingCount());
    }

    /** 详情：举报本体 + 被举报内容快照 */
    @GetMapping("/{id}")
    @RequirePermission(value = "user:manage", message = "只有管理员可以查看举报")
    public Result<ReportDetailVO> detail(@PathVariable Long id) {
        return Result.success(reportService.detail(id));
    }

    /** 处理：受理（可删内容 / 封禁作者）或驳回 */
    @PostMapping("/{id}/handle")
    @RequirePermission(value = "user:manage", message = "只有管理员可以处理举报")
    public Result<Void> handle(@PathVariable Long id, @Valid @RequestBody HandleReportDTO dto) {
        reportService.handle(id, dto);
        return Result.success(null, "accept".equalsIgnoreCase(dto.getAction()) ? "已受理" : "已驳回");
    }
}
