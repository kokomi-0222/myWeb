package com.example.kokomi.mapper;

import java.util.List;

import org.apache.ibatis.annotations.Param;

import com.example.kokomi.dto.ReportPageQueryDTO;
import com.example.kokomi.entity.Report;
import com.example.kokomi.vo.ReportVO;

public interface ReportMapper {

    /** 插入举报；待处理去重靠 report 表的 pending_uniq 唯一索引兜底 */
    int insert(Report report);

    Report selectById(@Param("id") Long id);

    /** 同一人对同一对象是否已有待处理举报 */
    int countPending(@Param("reporterId") Long reporterId,
                     @Param("targetType") String targetType,
                     @Param("targetId") Long targetId);

    /** 我在某类对象上「待处理」的举报目标，前端用来把菜单显示成「已举报」 */
    List<Long> selectPendingTargetIds(@Param("reporterId") Long reporterId,
                                      @Param("targetType") String targetType);

    /** 处理一条举报；带 status = 0 条件，防止两个管理员同时点导致重复处理 */
    int updateHandle(Report report);

    List<ReportVO> selectPage(@Param("query") ReportPageQueryDTO query,
                              @Param("offset") int offset);

    long countPage(@Param("query") ReportPageQueryDTO query);

    /** 后台菜单上的待处理徽标 */
    long countPendingAll();

    /** 某个对象历史累计被举报次数 */
    int countByTarget(@Param("targetType") String targetType,
                      @Param("targetId") Long targetId);

    int countPendingByTarget(@Param("targetType") String targetType,
                             @Param("targetId") Long targetId);

    /**
     * 同一个对象上其他还挂着待处理的举报。
     * 受理并删除内容后，这些举报会一并结案，避免队列里堆一堆「内容已删除」。
     */
    List<Report> selectPendingByTarget(@Param("targetType") String targetType,
                                       @Param("targetId") Long targetId,
                                       @Param("exceptId") Long exceptId);
}
