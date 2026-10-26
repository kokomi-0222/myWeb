package com.example.kokomi.service.impl;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.kokomi.common.ResultCode;
import com.example.kokomi.entity.Comment;
import com.example.kokomi.entity.Post;
import com.example.kokomi.entity.User;
import com.example.kokomi.exception.CustomerException;
import com.example.kokomi.mapper.CommentLikeMapper;
import com.example.kokomi.mapper.CommentMapper;
import com.example.kokomi.mapper.PostMapper;
import com.example.kokomi.mapper.RolePermissionMapper;
import com.example.kokomi.mapper.UserMapper;
import com.example.kokomi.mapper.UserRoleMapper;
import com.example.kokomi.util.TextUtils;
import com.example.kokomi.util.PermissionCache;
import com.example.kokomi.service.CommentService;
import com.example.kokomi.service.NotificationService;
import com.example.kokomi.service.UserBanService;
import com.example.kokomi.service.UserVerifyService;
import com.example.kokomi.util.LoginUserHolder;
import com.example.kokomi.vo.CommentAuthorVO;
import com.example.kokomi.vo.CommentVO;
import com.example.kokomi.vo.PageVO;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class CommentServiceImpl implements CommentService {

    private final CommentMapper commentMapper;
    private final CommentLikeMapper commentLikeMapper;
    private final PostMapper postMapper;
    private final UserMapper userMapper;
    private final UserRoleMapper userRoleMapper;
    private final RolePermissionMapper rolePermissionMapper;
    private final NotificationService notificationService;
    private final UserBanService userBanService;
    private final UserVerifyService userVerifyService;

    @Value("${app.upload-path}")
    private String uploadPath;

    @Value("${app.base-url}")
    private String baseUrl;

    @Override
    public List<CommentVO> getCommentsByPostId(Long postId) {
        List<Comment> topLevel = commentMapper.selectTopLevelByPostId(postId);
        return buildTree(topLevel);
    }

    @Override
    public PageVO<CommentVO> getCommentsByPostIdPaginated(Long postId, int pageNum, int pageSize) {
        int offset = (pageNum - 1) * pageSize;
        List<Comment> topLevel = commentMapper.selectTopLevelByPostIdPaginated(postId, offset, pageSize);
        int total = commentMapper.countTopLevelByPostId(postId);

        return PageVO.build(buildTree(topLevel), (long) total, pageNum, pageSize);
    }

    /**
     * 把顶级评论 + 其子回复组装成树。
     * <p>
     * 作者信息、点赞状态、子回复各用一次批量查询，整体 SQL 次数固定，
     * 与评论条数无关（原来是每条评论 2~3 次查询，10 条顶级 + 30 条回复约 100 次）。
     */
    private List<CommentVO> buildTree(List<Comment> topLevel) {
        List<CommentVO> result = new ArrayList<>();
        if (topLevel == null || topLevel.isEmpty()) {
            return result;
        }

        List<Long> parentIds = topLevel.stream().map(Comment::getId).toList();
        // 一次取走所有子回复，再按 parentId 挂到对应评论下
        List<Comment> replies = commentMapper.selectRepliesByParentIds(parentIds);

        List<Comment> all = new ArrayList<>(topLevel);
        all.addAll(replies);

        // 作者：一次批量查
        Set<Long> userIds = all.stream()
                .map(Comment::getUserId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<Long, User> authorMap = userIds.isEmpty()
                ? Map.of()
                : userMapper.selectByIds(userIds).stream()
                        .collect(Collectors.toMap(User::getId, u -> u, (a, b) -> a));

        // 当前用户点赞过的评论 id 集合
        Long currentUserId = LoginUserHolder.getUserId();
        Set<Long> likedIds = currentUserId == null
                ? Set.of()
                : new HashSet<>(commentLikeMapper.selectLikedCommentIds(
                        currentUserId, all.stream().map(Comment::getId).toList()));

        // 先把所有评论转成 VO
        Map<Long, CommentVO> voMap = new HashMap<>();
        for (Comment c : all) {
            voMap.put(c.getId(), toVO(c, authorMap, likedIds));
        }

        // 再把子回复挂到父评论上；父评论不在当前页的回复直接丢弃（翻页时正常现象）
        for (Comment reply : replies) {
            CommentVO parent = voMap.get(reply.getParentId());
            CommentVO child = voMap.get(reply.getId());
            if (parent != null && child != null) {
                parent.getReplies().add(child);
            }
        }

        for (Comment c : topLevel) {
            CommentVO vo = voMap.get(c.getId());
            if (vo != null) {
                result.add(vo);
            }
        }
        return result;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public CommentVO createComment(Long postId, String content, Long parentId, String replyTo, String image) {
        Long userId = LoginUserHolder.getUserId();
        // 评论和回复都走这里，禁言 / 封号的人一律拦住
        userBanService.checkCanSpeak(userId);
        // 邮箱未验证的账号同样不能评论（幽灵号的主要价值就是刷评论）
        userVerifyService.requireVerified(userId);

        Post post = postMapper.selectById(postId);
        if (post == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "帖子不存在");
        }
        if ((content == null || content.trim().isEmpty()) && (image == null || image.isEmpty())) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "评论内容不能为空");
        }

        // 校验 parentId：父评论必须属于同一帖子，防止跨帖挂载
        Comment parentComment = null;
        if (parentId != null) {
            parentComment = commentMapper.selectById(parentId);
            if (parentComment == null || !parentComment.getPostId().equals(postId)) {
                throw new CustomerException(ResultCode.PARAM_ERROR, "父评论不属于该帖子");
            }
        }

        Comment comment = new Comment();
        comment.setPostId(postId);
        comment.setUserId(userId);
        comment.setContent(TextUtils.normalizeContent(content));
        comment.setParentId(parentId);
        comment.setReplyTo(replyTo);
        // 仅顶级评论可带图片，将图片从 temp 移到 images
        if (parentId == null && image != null && !image.isEmpty()) {
            comment.setImage(moveImageToPermanent(image));
        }

        commentMapper.insert(comment);

        // 重新查询获取完整记录（包括 createdAt）
        comment = commentMapper.selectById(comment.getId());

        // 只有顶级评论才增加帖子评论数
        if (parentId == null) {
            postMapper.incrementComments(postId);
        }

        // 通知：顶级评论提醒帖子作者，回复提醒被回复的人
        String excerpt = excerpt(comment.getContent());
        if (parentComment != null) {
            notificationService.notify(parentComment.getUserId(), userId, "reply",
                    postId, comment.getId(), "回复了你的评论：" + excerpt);
        } else {
            String title = post.getTitle();
            String suffix = (title == null || title.isBlank()) ? "" : "《" + title + "》";
            notificationService.notify(post.getUserId(), userId, "comment",
                    postId, comment.getId(), "评论了你的帖子" + suffix + "：" + excerpt);
        }

        return convertToVO(comment);
    }

    /** 评论摘要：去掉换行、截断，避免通知里出现一大段内容 */
    private String excerpt(String text) {
        if (text == null) {
            return "";
        }
        String flat = text.replaceAll("\\s+", " ").trim();
        return flat.length() <= 40 ? flat : flat.substring(0, 40) + "…";
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void likeComment(Long commentId) {
        Long userId = LoginUserHolder.getUserId();

        Comment comment = commentMapper.selectById(commentId);
        if (comment == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "评论不存在");
        }

        // 原子 INSERT IGNORE：遇唯一约束冲突时返回 0，消除 check-then-act 竞态
        int inserted = commentLikeMapper.insertIgnore(commentId, userId);
        if (inserted > 0) {
            commentMapper.incrementLikes(commentId);
            notificationService.notify(comment.getUserId(), userId, "like_comment",
                    comment.getPostId(), commentId, "赞了你的评论：" + excerpt(comment.getContent()));
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void unlikeComment(Long commentId) {
        Long userId = LoginUserHolder.getUserId();

        Comment comment = commentMapper.selectById(commentId);
        if (comment == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "评论不存在");
        }

        // 直接用 DELETE 返回值判断是否真正删除了记录，避免 check-then-act 竞态
        int deleted = commentLikeMapper.delete(commentId, userId);
        if (deleted > 0) {
            commentMapper.decrementLikes(commentId);
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteComment(Long commentId) {
        Long currentUserId = LoginUserHolder.getUserId();

        Comment comment = commentMapper.selectById(commentId);
        if (comment == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "评论不存在");
        }

        // 只有评论作者、帖子作者（仅顶级评论）或拥有 post:delete 权限的用户可以删除
        boolean isOwner = comment.getUserId().equals(currentUserId);
        boolean isPostAuthor = false;
        if (comment.getParentId() == null) {
            var post = postMapper.selectById(comment.getPostId());
            isPostAuthor = post != null && post.getUserId().equals(currentUserId);
        }
        boolean hasDeletePerm = hasPermission(currentUserId, "post:delete");
        if (!isOwner && !isPostAuthor && !hasDeletePerm) {
            throw new CustomerException(ResultCode.NO_PERMISSION, "无权删除该评论");
        }

        deleteCommentInternal(commentId);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteCommentByAdmin(Long commentId) {
        if (commentMapper.selectById(commentId) == null) {
            return; // 已经被作者自己删掉了，幂等返回
        }
        deleteCommentInternal(commentId);
    }

    /** 真正的删除动作：子回复 + 图片 + 点赞 + 评论计数，权限判断在入口方法里 */
    private void deleteCommentInternal(Long commentId) {
        Comment comment = commentMapper.selectById(commentId);
        if (comment == null) {
            return;
        }

        // 删除子回复（先删图片文件，再删DB记录）
        List<Comment> replies = commentMapper.selectRepliesByParentId(commentId);
        for (Comment reply : replies) {
            deleteImageFile(reply.getImage());
            commentLikeMapper.deleteByCommentId(reply.getId());
            commentMapper.deleteById(reply.getId());
        }
        // 删除当前评论的图片文件
        deleteImageFile(comment.getImage());
        commentLikeMapper.deleteByCommentId(commentId);
        commentMapper.deleteById(commentId);

        // 只有顶级评论才减少帖子评论数
        if (comment.getParentId() == null) {
            postMapper.decrementComments(comment.getPostId());
        }
    }

    /** 单条评论转换（发评论后立即返回用） */
    private CommentVO convertToVO(Comment comment) {
        Long currentUserId = LoginUserHolder.getUserId();
        Set<Long> likedIds = currentUserId != null
                && commentLikeMapper.existsByCommentIdAndUserId(comment.getId(), currentUserId) > 0
                        ? Set.of(comment.getId())
                        : Set.of();
        User user = userMapper.selectById(comment.getUserId());
        Map<Long, User> authorMap = user == null ? Map.of() : Map.of(user.getId(), user);
        CommentVO vo = toVO(comment, authorMap, likedIds);
        // 单条场景下没有子回复，保持空列表而不是 null
        return vo;
    }

    /**
     * 单条评论 → VO，作者与点赞状态从已批量查好的 Map/Set 里取，不再访问数据库。
     */
    private CommentVO toVO(Comment comment, Map<Long, User> authorMap, Set<Long> likedIds) {
        CommentVO vo = new CommentVO();
        vo.setId(comment.getId());
        vo.setPostId(comment.getPostId());
        vo.setContent(comment.getContent());
        vo.setLikes(comment.getLikes());
        vo.setIsHot(comment.getIsHot() != null && comment.getIsHot() == 1);
        vo.setCreatedAt(comment.getCreatedAt());
        vo.setParentId(comment.getParentId());
        vo.setReplyTo(comment.getReplyTo());
        vo.setImage(comment.getImage());
        vo.setReplies(new ArrayList<>());

        User user = authorMap.get(comment.getUserId());
        if (user != null) {
            CommentAuthorVO author = new CommentAuthorVO();
            author.setId(user.getId());
            author.setName(user.getName());
            author.setNameColor(user.getNameColor());
            author.setRoleColor(user.getRoleColor());
            author.setPrimaryRole(user.getPrimaryRole());
            author.setAvatar(user.getAvatar());
            vo.setAuthor(author);
        }

        vo.setLikedByMe(likedIds.contains(comment.getId()));
        return vo;
    }

    /**
     * 将图片从 temp 目录移动到 images 永久目录，返回永久访问 URL。
     * 仅接受以 {@code /upload/temp/} 为路径的合法临时文件 URL，
     * 拒绝外部 URL、javascript: 协议等任意字符串。
     *
     * @param imageUrl 客户端传入的临时文件 URL
     * @return 迁移成功返回永久 URL，否则返回 null（评论将不携带图片）
     */
    private String moveImageToPermanent(String imageUrl) {
        // 必须是本地上传的临时文件 URL
        if (imageUrl == null || !imageUrl.contains("/upload/temp/")) {
            return null;
        }
        String filename = imageUrl.substring(imageUrl.lastIndexOf("/") + 1);
        // 防止路径穿越：文件名不能包含路径分隔符或上级目录标记
        if (filename.isEmpty() || filename.contains("/") || filename.contains("\\")
                || filename.contains("..")) {
            return null;
        }
        File tempFile = new File(uploadPath + "temp/" + filename);
        File imagesDir = new File(uploadPath + "images/");
        if (!imagesDir.exists()) {
            imagesDir.mkdirs();
        }
        File imageFile = new File(imagesDir, filename);
        try {
            // 直接 move，消除 exists() → move() 之间的 TOCTOU 竞态窗口
            Files.move(tempFile.toPath(), imageFile.toPath(),
                    StandardCopyOption.REPLACE_EXISTING);
            return baseUrl + "/upload/images/" + filename;
        } catch (IOException e) {
            return null;
        }
    }

    /**
     * 检查用户是否拥有指定权限（优先查缓存，缓存缺失时查 DB 并回填）。
     */
    private boolean hasPermission(Long userId, String permCode) {
        if (PermissionCache.hasPermission(userId, permCode)) {
            return true;
        }
        java.util.Set<String> roles = new java.util.HashSet<>(
                userRoleMapper.selectRolesByUserId(userId));
        java.util.Set<String> perms = new java.util.HashSet<>(
                rolePermissionMapper.selectPermissionsByUserId(userId));
        PermissionCache.put(userId, roles, perms);
        return perms.contains(permCode);
    }

    /**
     * 安全删除 images 目录下的图片文件。
     * 仅处理合法路径，防止路径穿越。
     */
    private void deleteImageFile(String url) {
        if (url == null || !url.contains("/upload/images/")) {
            return;
        }
        String filename = url.substring(url.lastIndexOf("/") + 1);
        if (filename.contains("/") || filename.contains("\\") || filename.contains("..")) {
            return;
        }
        File file = new File(uploadPath + "images/" + filename);
        if (file.exists()) {
            file.delete();
        }
    }
}