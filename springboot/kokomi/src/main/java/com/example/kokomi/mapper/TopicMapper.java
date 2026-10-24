package com.example.kokomi.mapper;

import com.example.kokomi.entity.Topic;
import com.example.kokomi.vo.TopicVO;
import org.apache.ibatis.annotations.Param;

import java.util.List;

public interface TopicMapper {

    /** 全部话题，按 sort 升序 */
    List<Topic> selectAll();

    Topic selectByValue(@Param("value") String value);

    Topic selectById(@Param("id") Long id);

    /** 帖子实际使用过的话题及数量：给话题表兜底历史数据用 */
    List<TopicVO> countPostByType();

    /** 某个 type 下的帖子数，删除话题前用来判断能不能删 */
    Long countPostsByValue(@Param("value") String value);

    /** 新建话题时排到最后 */
    Integer selectMaxSort();

    int insert(Topic topic);

    /** 改展示名 / 颜色 / 排序，只更新传进来的字段 */
    int update(Topic topic);

    int deleteById(@Param("id") Long id);
}
