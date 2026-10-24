package com.example.kokomi.service;

import java.util.List;
import java.util.Map;

import com.example.kokomi.dto.CreateReportDTO;
import com.example.kokomi.dto.HandleReportDTO;
import com.example.kokomi.dto.ReportPageQueryDTO;
import com.example.kokomi.vo.PageVO;
import com.example.kokomi.vo.ReportDetailVO;
import com.example.kokomi.vo.ReportVO;

public interface ReportService {

    /** 提交举报，返回举报 id。登录即可，不需要额外权限码。 */
    Long create(CreateReportDTO dto);

    /**
     * 当前用户在某类对象上「待处理」的举报目标 id。
     * 前端用它把菜单里的「举报」显示成「已举报，处理中」。
     */
    List<Long> myPendingTargetIds(String targetType);

    /** 举报理由字典（code -> 中文），前端弹窗直接渲染 */
    Map<String, String> reasons();

    /** 后台分页 */
    PageVO<ReportVO> page(ReportPageQueryDTO query);

    /** 后台详情：举报本体 + 被举报对象快照 */
    ReportDetailVO detail(Long id);

    /** 后台处理：受理（可删内容 / 封禁作者）或驳回 */
    void handle(Long id, HandleReportDTO dto);

    /** 后台菜单上的待处理数量 */
    long pendingCount();
}
