package com.example.kokomi.service.impl;

import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.kokomi.common.BanLevel;
import com.example.kokomi.common.ReportReason;
import com.example.kokomi.common.ResultCode;
import com.example.kokomi.dto.CreateReportDTO;
import com.example.kokomi.dto.HandleReportDTO;
import com.example.kokomi.dto.ReportPageQueryDTO;
import com.example.kokomi.entity.Comment;
import com.example.kokomi.entity.Post;
import com.example.kokomi.entity.PostMedia;
import com.example.kokomi.entity.Report;
import com.example.kokomi.entity.User;
import com.example.kokomi.exception.CustomerException;
import com.example.kokomi.mapper.CommentMapper;
import com.example.kokomi.mapper.PostMapper;
import com.example.kokomi.mapper.PostMediaMapper;
import com.example.kokomi.mapper.ReportMapper;
import com.example.kokomi.mapper.UserMapper;
import com.example.kokomi.service.CommentService;
import com.example.kokomi.service.NotificationService;
import com.example.kokomi.service.PostService;
import com.example.kokomi.service.ReportService;
import com.example.kokomi.service.UserBanService;
import com.example.kokomi.service.UserVerifyService;
import com.example.kokomi.util.LoginUserHolder;
import com.example.kokomi.vo.PageVO;
import com.example.kokomi.vo.ReportDetailVO;
import com.example.kokomi.vo.ReportTargetVO;
import com.example.kokomi.vo.ReportVO;

import cn.hutool.core.util.StrUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * 举报。
 * <p>
 * 两个关键取舍：
 * <ul>
 *   <li><b>举报不需要权限码</b>。它是每个登录用户的权利，不是特权；
 *       挂了 {@code post:report} 反而会让普通用户看不到入口——
 *       而被举报的恰恰大多是普通用户的内容。</li>
 *   <li><b>封禁不新增拦截器</b>。封禁时把 {@code token_version + 1}，
 *       复用登录态的版本校验，旧 token 下一次请求就失效，无需每请求查库。</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ReportServiceImpl implements ReportService {

    private static final Set<String> TYPES = Set.of("post", "comment", "user");

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    private final ReportMapper reportMapper;
    private final PostMapper postMapper;
    private final CommentMapper commentMapper;
    private final UserMapper userMapper;
    private final PostMediaMapper postMediaMapper;
    private final PostService postService;
    private final CommentService commentService;
    private final NotificationService notificationService;
    private final UserBanService userBanService;
    private final UserVerifyService userVerifyService;

    // ---------------------------------------------------------------- 提交

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long create(CreateReportDTO dto) {
        Long reporterId = requireLogin();
        // 幽灵号批量举报会把后台队列刷爆，先要求验证邮箱
        userVerifyService.requireVerified(reporterId);

        String type = StrUtil.trimToEmpty(dto.getTargetType()).toLowerCase();
        if (!TYPES.contains(type)) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "不支持举报这种内容");
        }
        if (!ReportReason.isValid(dto.getReasonCode())) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "请选择举报理由");
        }
        if (dto.getTargetId() == null || dto.getTargetId() <= 0) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "举报对象不正确");
        }

        // 顺带校验对象是否存在、是不是自己的东西
        Long targetAuthorId = checkTarget(type, dto.getTargetId(), reporterId);

        if (reportMapper.countPending(reporterId, type, dto.getTargetId()) > 0) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "你已经举报过了，我们正在处理");
        }

        Report report = new Report();
        report.setTargetType(type);
        report.setTargetId(dto.getTargetId());
        report.setTargetAuthorId(targetAuthorId);
        report.setReporterId(reporterId);
        report.setReasonCode(dto.getReasonCode());
        report.setDetail(StrUtil.trimToNull(dto.getDetail()));
        report.setStatus(0);

        try {
            reportMapper.insert(report);
        } catch (DuplicateKeyException e) {
            // 连点两次：唯一索引只放行一条，第二条在这里变成友好提示
            throw new CustomerException(ResultCode.PARAM_ERROR, "你已经举报过了，我们正在处理");
        }
        return report.getId();
    }

    /**
     * 校验举报对象，返回内容作者 id。
     * 「不能举报自己」放在这里，是因为三种对象都要判断，且文案各不相同。
     */
    private Long checkTarget(String type, Long targetId, Long reporterId) {
        switch (type) {
            case "post" -> {
                Post post = postMapper.selectById(targetId);
                if (post == null) {
                    throw new CustomerException(ResultCode.PARAM_ERROR, "这条帖子已经不存在了");
                }
                if (post.getUserId().equals(reporterId)) {
                    throw new CustomerException(ResultCode.PARAM_ERROR, "不能举报自己的帖子");
                }
                return post.getUserId();
            }
            case "comment" -> {
                Comment comment = commentMapper.selectById(targetId);
                if (comment == null) {
                    throw new CustomerException(ResultCode.PARAM_ERROR, "这条评论已经不存在了");
                }
                if (comment.getUserId().equals(reporterId)) {
                    throw new CustomerException(ResultCode.PARAM_ERROR, "不能举报自己的评论");
                }
                return comment.getUserId();
            }
            default -> {
                if (targetId.equals(reporterId)) {
                    throw new CustomerException(ResultCode.PARAM_ERROR, "不能举报自己");
                }
                User user = userMapper.selectById(targetId);
                if (user == null) {
                    throw new CustomerException(ResultCode.PARAM_ERROR, "用户不存在");
                }
                return user.getId();
            }
        }
    }

    @Override
    public List<Long> myPendingTargetIds(String targetType) {
        Long userId = LoginUserHolder.getUserId();
        String type = StrUtil.trimToEmpty(targetType).toLowerCase();
        if (userId == null || !TYPES.contains(type)) {
            return List.of();
        }
        return reportMapper.selectPendingTargetIds(userId, type);
    }

    @Override
    public Map<String, String> reasons() {
        return new LinkedHashMap<>(ReportReason.all());
    }

    // ---------------------------------------------------------------- 后台查询

    @Override
    public PageVO<ReportVO> page(ReportPageQueryDTO query) {
        int pageNum = query.getPageNum() == null ? 1 : Math.max(query.getPageNum(), 1);
        int pageSize = query.getPageSize() == null ? 10 : Math.min(Math.max(query.getPageSize(), 1), 50);

        ReportPageQueryDTO safe = new ReportPageQueryDTO();
        safe.setPageNum(pageNum);
        safe.setPageSize(pageSize);
        safe.setStatus(query.getStatus());
        safe.setTargetType(StrUtil.trimToNull(query.getTargetType()));

        List<ReportVO> list = reportMapper.selectPage(safe, (pageNum - 1) * pageSize);
        long total = reportMapper.countPage(safe);
        fillTargets(list);
        return PageVO.build(list, total, pageNum, pageSize);
    }

    /**
     * 给列表补「被举报对象」的摘要。
     * <p>
     * 后台一页最多 50 条、只有管理员在用，所以这里直接逐条查目标，
     * 不做批量拼装——可读性比这几十次主键查询更值钱。
     */
    private void fillTargets(List<ReportVO> list) {
        for (ReportVO vo : list) {
            vo.setReasonLabel(ReportReason.labelOf(vo.getReasonCode()));
            vo.setTargetReportCount(reportMapper.countByTarget(vo.getTargetType(), vo.getTargetId()));

            ReportTargetVO target = buildTarget(vo.getTargetType(), vo.getTargetId(), false,
                    vo.getTargetAuthorId());
            vo.setTargetExists(target.getExists());
            // 内容还在就用实时作者；已被删则退回举报时冗余记下的作者
            vo.setTargetAuthorId(target.getAuthorId() != null ? target.getAuthorId() : vo.getTargetAuthorId());
            vo.setTargetAuthorName(target.getAuthorName());
            vo.setTargetSummary(summaryOf(target));
        }
    }

    /** 列表里那一行摘要：优先标题，其次正文前 60 字 */
    private String summaryOf(ReportTargetVO target) {
        if (!Boolean.TRUE.equals(target.getExists())) {
            return "内容已删除";
        }
        if (StrUtil.isNotBlank(target.getTitle())) {
            return truncate(target.getTitle(), 60);
        }
        String text = StrUtil.trimToEmpty(target.getContent()).replaceAll("\\s+", " ");
        return truncate(text, 60);
    }

    @Override
    public ReportDetailVO detail(Long id) {
        Report report = reportMapper.selectById(id);
        if (report == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "举报记录不存在");
        }
        ReportDetailVO vo = new ReportDetailVO();

        List<ReportVO> one = new ArrayList<>();
        ReportVO row = toRow(report);
        one.add(row);
        fillTargets(one);
        vo.setReport(row);

        // 详情里的正文不截断：管理员要能看全貌才判断得准
        vo.setTarget(buildTarget(report.getTargetType(), report.getTargetId(), true,
                report.getTargetAuthorId()));
        return vo;
    }

    /** 单条 report 转列表行（详情接口复用） */
    private ReportVO toRow(Report report) {
        ReportVO vo = new ReportVO();
        vo.setId(report.getId());
        vo.setTargetType(report.getTargetType());
        vo.setTargetId(report.getTargetId());
        vo.setTargetAuthorId(report.getTargetAuthorId());
        vo.setReporterId(report.getReporterId());
        vo.setReasonCode(report.getReasonCode());
        vo.setDetail(report.getDetail());
        vo.setStatus(report.getStatus());
        vo.setHandlerId(report.getHandlerId());
        vo.setHandleAction(report.getHandleAction());
        vo.setHandleNote(report.getHandleNote());
        vo.setHandleTime(report.getHandleTime());
        vo.setCreatedAt(report.getCreatedAt());

        User reporter = userMapper.selectById(report.getReporterId());
        if (reporter != null) {
            vo.setReporterName(reporter.getName());
            vo.setReporterAvatar(reporter.getAvatar());
        }
        if (report.getHandlerId() != null) {
            User handler = userMapper.selectById(report.getHandlerId());
            if (handler != null) {
                vo.setHandlerName(handler.getName());
            }
        }
        return vo;
    }

    /**
     * 组装被举报对象快照。
     *
     * @param withContent      true 表示详情用，正文完整返回；false 表示列表用（截断）
     * @param fallbackAuthorId 内容已不存在时用来兜底的作者 id（举报时冗余记录的）
     */
    private ReportTargetVO buildTarget(String type, Long targetId, boolean withContent,
                                       Long fallbackAuthorId) {
        ReportTargetVO vo = new ReportTargetVO();
        vo.setTargetType(type);
        vo.setTargetId(targetId);
        vo.setExists(false);
        vo.setTotalReports(reportMapper.countByTarget(type, targetId));
        vo.setPendingReports(reportMapper.countPendingByTarget(type, targetId));

        switch (type) {
            case "post" -> {
                Post post = postMapper.selectById(targetId);
                if (post == null) {
                    fillMissingAuthor(vo, fallbackAuthorId);
                    return vo;
                }
                vo.setExists(true);
                vo.setAuthorId(post.getUserId());
                vo.setTitle(post.getTitle());
                vo.setContent(withContent ? post.getContent() : truncate(post.getContent(), 800));
                List<PostMedia> media = postMediaMapper.selectByPostId(targetId);
                if (!media.isEmpty()) {
                    PostMedia first = media.get(0);
                    vo.setImage(first.getPreviewUrl() != null ? first.getPreviewUrl() : first.getRawUrl());
                }
                fillAuthor(vo, post.getUserId());
            }
            case "comment" -> {
                Comment comment = commentMapper.selectById(targetId);
                if (comment == null) {
                    fillMissingAuthor(vo, fallbackAuthorId);
                    return vo;
                }
                vo.setExists(true);
                vo.setAuthorId(comment.getUserId());
                vo.setContent(comment.getContent());
                vo.setImage(comment.getImage());
                Post post = postMapper.selectById(comment.getPostId());
                if (post != null) {
                    vo.setContext(post.getTitle());
                }
                fillAuthor(vo, comment.getUserId());
            }
            default -> {
                User user = userMapper.selectById(targetId);
                if (user == null) {
                    fillMissingAuthor(vo, fallbackAuthorId);
                    return vo;
                }
                vo.setExists(true);
                vo.setAuthorId(user.getId());
                // 用户没有「正文」，用签名当摘要，昵称放 title
                vo.setTitle(user.getName());
                vo.setContent(user.getSignature());
                fillAuthor(vo, user.getId());
            }
        }
        return vo;
    }

    /** 内容已经被删：用举报时记下的作者兜底，至少让后台知道是谁的东西 */
    private void fillMissingAuthor(ReportTargetVO target, Long fallbackAuthorId) {
        if (fallbackAuthorId == null) {
            return;
        }
        target.setAuthorId(fallbackAuthorId);
        fillAuthor(target, fallbackAuthorId);
    }

    /** 作者昵称 / 头像 / 当前处罚状态 */
    private void fillAuthor(ReportTargetVO target, Long authorId) {
        User author = userMapper.selectById(authorId);
        if (author == null) {
            return;
        }
        target.setAuthorName(author.getName());
        target.setAuthorAvatar(author.getAvatar());
        boolean punished = BanLevel.isPunished(author.getStatus());
        target.setAuthorBanned(punished);
        target.setAuthorBanLevel(punished ? author.getStatus() : BanLevel.NORMAL);
        target.setAuthorBanUntil(punished ? author.getBanUntil() : null);
        target.setAuthorBanReason(punished ? author.getBanReason() : null);
    }

    // ---------------------------------------------------------------- 处理

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void handle(Long id, HandleReportDTO dto) {
        Long handlerId = requireLogin();

        Report report = reportMapper.selectById(id);
        if (report == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "举报记录不存在");
        }
        if (report.getStatus() == null || report.getStatus() != 0) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "这条举报已经处理过了");
        }

        String action = StrUtil.trimToEmpty(dto.getAction()).toLowerCase();
        if (!"accept".equals(action) && !"reject".equals(action)) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "请选择处理方式");
        }

        String note = StrUtil.trimToNull(dto.getNote());
        List<String> done = new ArrayList<>();

        if ("reject".equals(action)) {
            report.setStatus(2);
            report.setHandlerId(handlerId);
            report.setHandleAction("reject");
            report.setHandleNote(note == null ? "经核查未发现违规" : note);
            if (reportMapper.updateHandle(report) == 0) {
                throw new CustomerException(ResultCode.PARAM_ERROR, "这条举报已经处理过了");
            }
            notifyReporter(report, handlerId, "你举报的内容经核查未发现违规，已驳回。" + suffix(note));
            return;
        }

        // ---- 受理 ----
        // 必须先取作者：删掉内容之后就查不到作者是谁了。
        // 优先用举报时冗余记下的 author，内容已被别人删掉时仍然能封禁。
        Long authorId = report.getTargetAuthorId() != null
                ? report.getTargetAuthorId()
                : resolveAuthorId(report.getTargetType(), report.getTargetId());

        if (Boolean.TRUE.equals(dto.getDeleteContent())) {
            String what = deleteContent(report);
            if (what != null) {
                done.add("已删除" + what);
            }
        }

        Integer banDays = dto.getBanDays();
        if (banDays != null && banDays != 0 && authorId != null) {
            int level = "mute".equalsIgnoreCase(StrUtil.trimToEmpty(dto.getBanType()))
                    ? BanLevel.MUTE
                    : BanLevel.BAN;
            String punishedName = banAuthor(authorId, level, banDays, dto.getBanReason(), report.getId());
            done.add("已" + BanLevel.labelOf(level) + " " + punishedName);
        }

        report.setStatus(1);
        report.setHandlerId(handlerId);
        report.setHandleAction("accept");
        report.setHandleNote(buildAcceptNote(note, done));
        if (reportMapper.updateHandle(report) == 0) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "这条举报已经处理过了");
        }

        // 同一个对象上还挂着的其他举报：一并结案，免得队列里堆一堆「内容已删除」
        String reason = ReportReason.labelOf(report.getReasonCode());
        notifyReporter(report, handlerId,
                "你举报的内容（" + reason + "）已受理。" + String.join("，", done) + suffix(note));
        closeSiblingReports(report, handlerId, done);
    }

    private String buildAcceptNote(String note, List<String> done) {
        List<String> parts = new ArrayList<>();
        if (!done.isEmpty()) {
            parts.add(String.join("，", done));
        }
        if (note != null) {
            parts.add(note);
        }
        return parts.isEmpty() ? "已受理" : String.join("；", parts);
    }

    /** 受理后把同目标其他待处理举报也结案，并分别通知各自的举报人 */
    private void closeSiblingReports(Report handled, Long handlerId, List<String> done) {
        List<Report> siblings = reportMapper.selectPendingByTarget(
                handled.getTargetType(), handled.getTargetId(), handled.getId());
        if (siblings.isEmpty()) {
            return;
        }
        String base = "你举报的内容已由举报 #" + handled.getId() + " 一并处理。"
                + (done.isEmpty() ? "" : String.join("，", done));
        for (Report sibling : siblings) {
            sibling.setStatus(1);
            sibling.setHandlerId(handlerId);
            sibling.setHandleAction("accept");
            sibling.setHandleNote("与举报 #" + handled.getId() + " 合并处理");
            reportMapper.updateHandle(sibling);
            notifyReporter(sibling, handlerId, base);
        }
    }

    /**
     * 删掉被举报的内容。
     *
     * @return 删掉的是什么（"帖子" / "评论"），没删则返回 null
     */
    private String deleteContent(Report report) {
        try {
            switch (report.getTargetType()) {
                case "post" -> {
                    postService.deletePostByAdmin(report.getTargetId());
                    return "帖子";
                }
                case "comment" -> {
                    commentService.deleteCommentByAdmin(report.getTargetId());
                    return "评论";
                }
                default -> {
                    // 用户不能「删除」，只能封禁
                    return null;
                }
            }
        } catch (Exception e) {
            // 内容可能已经被作者自己删了：这不算处理失败，继续走封禁 / 结案
            log.warn("处理举报 #{} 时删除内容失败 target={}:{}", report.getId(),
                    report.getTargetType(), report.getTargetId(), e);
            return null;
        }
    }

    /** 取被举报内容 / 用户的作者 id；对象已不存在时返回 null */
    private Long resolveAuthorId(String type, Long targetId) {
        return switch (type) {
            case "post" -> {
                Post post = postMapper.selectById(targetId);
                yield post == null ? null : post.getUserId();
            }
            case "comment" -> {
                Comment comment = commentMapper.selectById(targetId);
                yield comment == null ? null : comment.getUserId();
            }
            default -> targetId;
        };
    }

    /**
     * 处罚作者（禁言或封号）。
     * <p>
     * 保护规则和缓存失效都在 {@link UserBanService} 里，这里只补一条「举报来源」的默认理由。
     *
     * @param level  {@link BanLevel#MUTE} 或 {@link BanLevel#BAN}
     * @param banDays 正数按天，-1 永久
     * @return 被处罚人的昵称（给处理备注用）
     */
    private String banAuthor(Long authorId, int level, Integer banDays, String reason, Long reportId) {
        String text = StrUtil.isBlank(reason)
                ? "违反社区规范（举报处理 #" + reportId + "）"
                : reason;
        return userBanService.punish(authorId, level, banDays, text);
    }

    private void notifyReporter(Report report, Long handlerId, String content) {
        // post_id 只在举报帖子时传，前端点通知能跳到原帖
        Long postId = "post".equals(report.getTargetType()) ? report.getTargetId() : null;
        notificationService.notify(report.getReporterId(), handlerId, "report_result",
                postId, null, content);
    }

    @Override
    public long pendingCount() {
        return reportMapper.countPendingAll();
    }

    // ---------------------------------------------------------------- 小工具

    private Long requireLogin() {
        Long userId = LoginUserHolder.getUserId();
        if (userId == null) {
            throw new CustomerException(ResultCode.AUTHOR_ERROR, "请先登录");
        }
        return userId;
    }

    private String suffix(String note) {
        return StrUtil.isBlank(note) ? "" : "备注：" + note;
    }

    private String truncate(String text, int max) {
        if (text == null) {
            return null;
        }
        return text.length() <= max ? text : text.substring(0, max) + "…";
    }
}
