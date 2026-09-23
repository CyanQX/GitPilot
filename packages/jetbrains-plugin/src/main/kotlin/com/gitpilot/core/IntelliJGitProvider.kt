// ============================================================
// IntelliJGitProvider (Kotlin) v1.2.9 sync
// Fully aligned with VS Code vscode-git-provider.ts
// Adds: branch verification, origin check, git add -A, getStagedFiles
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

    /** ⭐ git add -A stages everything, then excludes the given files */
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
                    } catch (_: Exception) { /* non-critical */ }
                }
            }
            added
        } catch (e: Exception) { false }
    }

    /** ⭐ Get the list of staged files */
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
        val repo = getRepo() ?: return CommitResult(false, null, "Git repository not found")
        return try {
            val handler = GitLineHandler(project, repo.root, GitCommand.COMMIT)
            handler.addParameters("-m", message)
            val result = git.runCommand(handler)
            CommitResult(result.success(), repo.currentRevision?.take(7), result.errorOutputAsJoinedString)
        } catch (e: Exception) { CommitResult(false, null, e.message) }
    }

    /** ⭐ Push (with remote existence check + branch verification) */
    override fun push(remote: String): PushResult {
        val repo = getRepo() ?: return PushResult(false, false, "Git repository not found")

        val remoteExists = repo.remotes.any { it.name == remote }
        if (!remoteExists) {
            return PushResult(false, false, "Remote repository '$remote' is not configured. Please link a GitHub repository first.")
        }

        val targetBranch = repo.currentBranch?.name ?: return PushResult(false, false, "No current branch detected")
        try {
            val revHandler = GitLineHandler(project, repo.root, GitCommand.REV_PARSE)
            revHandler.addParameters("--verify", targetBranch)
            if (!git.runCommand(revHandler).success()) {
                return PushResult(false, false, "The local branch '$targetBranch' does not exist")
            }
        } catch (_: Exception) {}

        try {
            val fetchHandler = GitLineHandler(project, repo.root, GitCommand.FETCH)
            fetchHandler.addParameters(remote)
            git.runCommand(fetchHandler)
        } catch (_: Exception) {}

        val info = repo.currentBranch?.trackingInfo
        if (info != null && info.behind > 0) {
            return PushResult(false, false, "The remote has ${info.behind} new commit(s), please run Sync first", nonFastForward = true)
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
