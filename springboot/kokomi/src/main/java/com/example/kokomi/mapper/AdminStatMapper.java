package com.example.kokomi.mapper;

import com.example.kokomi.vo.AdminStatVO;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 后台概览的只读统计。
 * 与业务 Mapper 分开，避免往 UserMapper / PostMapper 里塞一堆 count。
 */
public interface AdminStatMapper {

    /** 总数 + 今日新增，一次查询全部拿到 */
    AdminStatVO selectCounts();

    /** 最近注册的用户 */
    List<AdminStatVO.RecentUser> selectRecentUsers(@Param("limit") int limit);

    /** 最新发布的帖子 */
    List<AdminStatVO.RecentPost> selectRecentPosts(@Param("limit") int limit);
}
