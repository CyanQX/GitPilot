// ============================================================
// IntelliJGitProvider (Kotlin) v1.2.9 同步
// 完全对标 VS Code vscode-git-provider.ts
// 新增：分支验证、origin 检查、git add -A、getStagedFiles
// ============================================================

package com.gitpilot.core

import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import git4idea.GitUtil
import git4idea.commands.*
import git4idea.repo.GitRepositoryManager

@Service(Service.Level.PROJECT)
class IntelliJGitProvider(private val project: Project) : IGitProvider {

    private val git = Git.getInstance()

    private fun getRepo() = GitRepositoryManager.getInstance(project).repositories.firstOrNull()

    override fun hasChanges(): Boolean {
        val repo = getRepo() ?: return false
        val status = GitUtil.getStatus(project, repo.root)
        return !(status.modified.isEmpty() && status.added.isEmpty() && status.removed.isEmpty() && status.untracked.isEmpty())
    }

    override fun getStatus(): GitStatus? {
        val repo = getRepo() ?: return null
        val s = GitUtil.getStatus(project, repo.root)
        val branch = repo.currentBranch?.name ?: "unknown"
        val info = repo.currentBranch?.trackingInfo
        return GitStatus(
            isClean = s.modified.isEmpty() && s.added.isEmpty() && s.untracked.isEmpty(),
            modified = s.modified,
            added = s.added,
            deleted = s.removed,
            untracked = s.untracked,
            currentBranch = branch,
            ahead = info?.ahead ?: 0,
            behind = info?.behind ?: 0
        )
    }

    /** ⭐ git add -A 全量暂存，再排除指定文件 */
    override fun stageFiles(excludeFiles: List<String>): Boolean {
        val repo = getRepo() ?: return false
        return try {
            val addHandler = GitLineHandler(project, repo.root, GitCommand.ADD)
            addHandler.addParameters("-A")
            val added = git.runCommand(addHandler).success()
            for (file in excludeFiles) {
                try {
                    val resetHandler = GitLineHandler(project, repo.root, GitCommand.RESET)
                    resetHandler.addParameters("--", file)
                    git.runCommand(resetHandler)
                } catch (_: Exception) {
                    try {
                        val rmHandler = GitLineHandler(project, repo.root, GitCommand.RM)
                        rmHandler.addParameters("--cached", "-r", "--quiet", file)
                        git.runCommand(rmHandler)
                    } catch (_: Exception) { /* 非关键 */ }
                }
            }
            added
        } catch (e: Exception) { false }
    }

    /** ⭐ 获取已暂存文件列表 */
    override fun getStagedFiles(): List<String> {
        val repo = getRepo() ?: return emptyList()
        return try {
            val handler = GitLineHandler(project, repo.root, GitCommand.DIFF)
            handler.addParameters("--cached", "--name-only")
            val result = git.runCommand(handler)
            result.output.joinToString("\n").lines().filter { it.isNotBlank() }
        } catch (_: Exception) { emptyList() }
    }

    override fun commit(message: String): CommitResult {
        val repo = getRepo() ?: return CommitResult(false, null, "未找到 Git 仓库")
        return try {
            val handler = GitLineHandler(project, repo.root, GitCommand.COMMIT)
            handler.addParameters("-m", message)
            val result = git.runCommand(handler)
            CommitResult(result.success(), repo.currentRevision?.take(7), result.errorOutputAsJoinedString)
        } catch (e: Exception) { CommitResult(false, null, e.message) }
    }

    /** ⭐ 推送（含 remote 存在性检查 + 分支验证） */
    override fun push(remote: String): PushResult {
        val repo = getRepo() ?: return PushResult(false, false, "未找到 Git 仓库")

        val remoteExists = repo.remotes.any { it.name == remote }
        if (!remoteExists) {
            return PushResult(false, false, "远程仓库 '$remote' 未配置。请先关联 GitHub 仓库。")
        }

        val targetBranch = repo.currentBranch?.name ?: return PushResult(false, false, "未检测到当前分支")
        try {
            val revHandler = GitLineHandler(project, repo.root, GitCommand.REV_PARSE)
            revHandler.addParameters("--verify", targetBranch)
            if (!git.runCommand(revHandler).success()) {
                return PushResult(false, false, "本地分支 '$targetBranch' 不存在")
            }
        } catch (_: Exception) {}

        try {
            val fetchHandler = GitLineHandler(project, repo.root, GitCommand.FETCH)
            fetchHandler.addParameters(remote)
            git.runCommand(fetchHandler)
        } catch (_: Exception) {}

        val info = repo.currentBranch?.trackingInfo
        if (info != null && info.behind > 0) {
            return PushResult(false, false, "远端有 ${info.behind} 个新提交，请先 Sync", nonFastForward = true)
        }

        return try {
            val handler = GitLineHandler(project, repo.root, GitCommand.PUSH)
            handler.addParameters(remote, targetBranch)
            val result = git.runCommand(handler)
            val outStr = result.errorOutputAsJoinedString
            PushResult(result.success(), !outStr.contains("up-to-date") && !outStr.contains("Everything"), outStr)
        } catch (e: Exception) {
            PushResult(false, false, e.message, e.message?.contains("non-fast-forward") == true)
        }
    }

    override fun pull(): Boolean {
        val repo = getRepo() ?: return false
        return try {
            val handler = GitLineHandler(project, repo.root, GitCommand.PULL)
            git.runCommand(handler).success()
        } catch (e: Exception) { false }
    }

    override fun getCurrentBranch(): String? = getRepo()?.currentBranch?.name
    override fun getRemoteUrl(remote: String): String? =
        getRepo()?.remotes?.firstOrNull { it.name == remote }?.firstUrl
    override fun hasRemote(remote: String): Boolean =
        getRepo()?.remotes?.any { it.name == remote } == true
    override fun addRemote(name: String, url: String): Boolean {
        val repo = getRepo() ?: return false
        return try {
            val handler = GitLineHandler(project, repo.root, GitCommand.REMOTE)
            handler.addParameters("add", name, url)
            git.runCommand(handler).success()
        } catch (e: Exception) { false }
    }
}
