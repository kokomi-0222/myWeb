package com.example.kokomi.service.impl;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.kokomi.common.ResultCode;
import com.example.kokomi.entity.Comment;
import com.example.kokomi.entity.User;
import com.example.kokomi.exception.CustomerException;
import com.example.kokomi.mapper.CommentLikeMapper;
import com.example.kokomi.mapper.CommentMapper;
import com.example.kokomi.mapper.PostMapper;
import com.example.kokomi.mapper.RolePermissionMapper;
import com.example.kokomi.mapper.UserMapper;
import com.example.kokomi.mapper.UserRoleMapper;
import com.example.kokomi.util.PermissionCache;
import com.example.kokomi.service.CommentService;
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

    @Value("${app.upload-path}")
    private String uploadPath;

    @Value("${app.base-url}")
    private String baseUrl;

    @Override
    public List<CommentVO> getCommentsByPostId(Long postId) {
        List<Comment> topLevel = commentMapper.selectTopLevelByPostId(postId);
        List<CommentVO> result = new ArrayList<>();

        for (Comment comment : topLevel) {
            CommentVO vo = convertToVO(comment);
            // 加载子回复
            List<Comment> replies = commentMapper.selectRepliesByParentId(comment.getId());
            List<CommentVO> replyVOs = new ArrayList<>();
            for (Comment reply : replies) {
                replyVOs.add(convertToVO(reply));
            }
            vo.setReplies(replyVOs);
            result.add(vo);
        }
        return result;
    }

    @Override
    public PageVO<CommentVO> getCommentsByPostIdPaginated(Long postId, int pageNum, int pageSize) {
        int offset = (pageNum - 1) * pageSize;
        List<Comment> topLevel = commentMapper.selectTopLevelByPostIdPaginated(postId, offset, pageSize);
        int total = commentMapper.countTopLevelByPostId(postId);

        List<CommentVO> voList = new ArrayList<>();
        for (Comment comment : topLevel) {
            CommentVO vo = convertToVO(comment);
            List<Comment> replies = commentMapper.selectRepliesByParentId(comment.getId());
            List<CommentVO> replyVOs = new ArrayList<>();
            for (Comment reply : replies) {
                replyVOs.add(convertToVO(reply));
            }
            vo.setReplies(replyVOs);
            voList.add(vo);
        }
        return PageVO.build(voList, (long) total, pageNum, pageSize);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public CommentVO createComment(Long postId, String content, Long parentId, String replyTo, String image) {
        Long userId = LoginUserHolder.getUserId();

        if (postMapper.selectById(postId) == null) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "帖子不存在");
        }
        if ((content == null || content.trim().isEmpty()) && (image == null || image.isEmpty())) {
            throw new CustomerException(ResultCode.PARAM_ERROR, "评论内容不能为空");
        }

        // 校验 parentId：父评论必须属于同一帖子，防止跨帖挂载
        if (parentId != null) {
            Comment parentComment = commentMapper.selectById(parentId);
            if (parentComment == null || !parentComment.getPostId().equals(postId)) {
                throw new CustomerException(ResultCode.PARAM_ERROR, "父评论不属于该帖子");
            }
        }

        Comment comment = new Comment();
        comment.setPostId(postId);
        comment.setUserId(userId);
        comment.setContent(content != null ? content.trim() : "");
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

        return convertToVO(comment);
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

    private CommentVO convertToVO(Comment comment) {
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

        // 作者信息
        User user = userMapper.selectById(comment.getUserId());
        if (user != null) {
            CommentAuthorVO author = new CommentAuthorVO();
            author.setId(user.getId());
            author.setName(user.getName());
            author.setNameColor(user.getNameColor());
            author.setAvatar(user.getAvatar());
            vo.setAuthor(author);
        }

        // 当前用户是否已点赞
        Long currentUserId = LoginUserHolder.getUserId();
        vo.setLikedByMe(currentUserId != null
                && commentLikeMapper.existsByCommentIdAndUserId(comment.getId(), currentUserId) > 0);

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