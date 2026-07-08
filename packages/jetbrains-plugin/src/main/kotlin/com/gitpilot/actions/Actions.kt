// ============================================================
// GitPilot Actions (Kotlin) v1.2.9
// 全部对标 VS Code extension.ts 命令
// ============================================================

package com.gitpilot.actions

import com.gitpilot.core.*
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import java.io.File

// ── 辅助函数 ──
private fun getProviders(project: Project): Triple<GitHubRepoProvider, IntelliJGitProvider, DeployOrchestrator>? {
    val token = GitPilotSettings.getActiveToken() ?: return null
    val rp = GitHubRepoProvider(token)
    val gp = project.getService(IntelliJGitProvider::class.java)
    val orch = project.getService(DeployOrchestrator::class.java)
    return Triple(rp, gp, orch)
}

private fun getBuildAndFilter(project: Project): Pair<BuildProvider, SmartFilter> {
    val bp = BuildProvider()
    val wsRoot = project.basePath ?: System.getProperty("user.dir")
    val sf = SmartFilter(wsRoot, true)
    return Pair(bp, sf)
}

// ── Deploy ──
class DeployAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val (rp, gp, orch) = getProviders(project) ?: run { Messages.showWarningDialog(project, "请先登录 GitHub", "GitPilot"); return }
        val (bp, sf) = getBuildAndFilter(project)
        val settings = GitPilotSettings.instance

        ProgressManager.getInstance().runProcessWithProgressSynchronously({
            val result = orch.deploy(it, rp, gp, bp, null,
                settings.buildCommand.ifEmpty { null },
                settings.buildBeforeDeploy, settings.blockOnBuildFailure, sf,
                settings.commitMessageTemplate)
            ApplicationManager.getApplication().invokeLater {
                if (result.success) {
                    val stageStep = result.steps.find { s -> s.name == "暂存文件" }
                    val info = stageStep?.details ?: ""
                    Messages.showInfoMessage(project, "🚀 部署成功！$info", "GitPilot")
                } else Messages.showErrorDialog(project, result.error ?: "部署失败", "GitPilot")
            }
        }, "GitPilot 部署中...", true, project)
    }
    override fun update(e: AnActionEvent) {
        e.presentation.isEnabled = e.project != null && GitPilotSettings.getActiveToken() != null
    }
}

// ── Sync ──
class SyncAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val (rp, gp, orch) = getProviders(project) ?: run { Messages.showWarningDialog(project, "请先登录 GitHub", "GitPilot"); return }
        val (bp, sf) = getBuildAndFilter(project)
        val settings = GitPilotSettings.instance

        ProgressManager.getInstance().runProcessWithProgressSynchronously({
            val result = orch.sync(it, rp, gp, bp, null,
                settings.buildCommand.ifEmpty { null },
                settings.buildBeforeDeploy, settings.blockOnBuildFailure, sf)
            ApplicationManager.getApplication().invokeLater {
                if (result.success) Messages.showInfoMessage(project, "🔄 同步完成！", "GitPilot")
                else Messages.showErrorDialog(project, result.error ?: "同步失败", "GitPilot")
            }
        }, "GitPilot 同步中...", true, project)
    }
    override fun update(e: AnActionEvent) {
        e.presentation.isEnabled = e.project != null && GitPilotSettings.getActiveToken() != null
    }
}

// ── Login ──
class LoginAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val token = Messages.showPasswordDialog(project, "输入 GitHub Personal Access Token\n（需要 repo + workflow 权限）\n创建: https://github.com/settings/tokens", "GitPilot · 登录", null)
        if (token.isNullOrEmpty()) return
        val rp = GitHubRepoProvider(token)
        if (!rp.validateToken()) { Messages.showErrorDialog(project, "Token 无效，请检查权限", "GitPilot"); return }
        val user = rp.getCurrentUser()
        GitPilotSettings.saveToken(user ?: "unknown", token)
        GitPilotSettings.instance.activeAccount = user ?: "unknown"
        Messages.showInfoMessage(project, "✅ 已登录: $user", "GitPilot")
    }
    override fun update(e: AnActionEvent) {
        e.presentation.isEnabledAndVisible = GitPilotSettings.getActiveToken() == null
    }
}

// ── Logout ──
class LogoutAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        if (Messages.showYesNoDialog(project, "确定登出？", "GitPilot", Messages.getWarningIcon()) == Messages.YES) {
            val login = GitPilotSettings.instance.activeAccount
            if (login.isNotEmpty()) GitPilotSettings.deleteToken(login)
            GitPilotSettings.instance.activeAccount = ""
            Messages.showInfoMessage(project, "已登出", "GitPilot")
        }
    }
    override fun update(e: AnActionEvent) {
        e.presentation.isEnabled = GitPilotSettings.getActiveToken() != null
    }
}

// ── Create Repo ──
class CreateRepoAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val token = GitPilotSettings.getActiveToken() ?: run { Messages.showWarningDialog(project, "请先登录", "GitPilot"); return }
        val name = Messages.showInputDialog(project, "仓库名称", "GitPilot · 创建仓库", null) ?: return
        val isPrivate = Messages.showYesNoDialog(project, "设为私有仓库？", "GitPilot", Messages.getQuestionIcon()) == Messages.YES
        val rp = GitHubRepoProvider(token)
        val repo = rp.createRepo(name, isPrivate)
        if (repo != null) {
            // 自动设置 git remote
            val gp = project.getService(IntelliJGitProvider::class.java)
            if (!gp.hasRemote("origin")) {
                gp.addRemote("origin", repo.cloneUrl)
            }
            Messages.showInfoMessage(project, "✅ 已创建: ${repo.fullName}\n已关联本地 git remote", "GitPilot")
        } else Messages.showErrorDialog(project, "创建失败", "GitPilot")
    }
    override fun update(e: AnActionEvent) {
        e.presentation.isEnabled = e.project != null && GitPilotSettings.getActiveToken() != null
    }
}

// ── Switch Repo ──
class SwitchRepoAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val token = GitPilotSettings.getActiveToken() ?: return
        val rp = GitHubRepoProvider(token)
        val repos = rp.listRepos()
        if (repos.isEmpty()) { Messages.showInfoMessage(project, "无可用仓库", "GitPilot"); return }

        val names = repos.map { it.fullName }.toTypedArray()
        val chosen = Messages.showEditableChooseDialog("选择要关联的 GitHub 仓库", "GitPilot · 切换仓库", null, names, names.firstOrNull(), null)
        if (chosen == -1) return
        val repo = repos[chosen]
        val gp = project.getService(IntelliJGitProvider::class.java)
        if (!gp.hasRemote("origin")) gp.addRemote("origin", repo.cloneUrl)
        Messages.showInfoMessage(project, "✅ 已切换至: ${repo.fullName}", "GitPilot")
    }
    override fun update(e: AnActionEvent) {
        e.presentation.isEnabled = e.project != null && GitPilotSettings.getActiveToken() != null
    }
}

// ── Configure Build ──
class ConfigureBuildAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val settings = GitPilotSettings.instance
        val cmd = Messages.showInputDialog(project, "输入构建命令\n（npm run build / cargo build / ...）", "GitPilot", null, settings.buildCommand, null) ?: return
        val beforeDeploy = Messages.showYesNoDialog(project, "部署前执行 Build？", "GitPilot", Messages.getQuestionIcon())
        val blockOnFail = Messages.showYesNoDialog(project, "Build 失败时阻止部署？", "GitPilot", Messages.getQuestionIcon())
        settings.buildCommand = cmd
        settings.buildBeforeDeploy = beforeDeploy == Messages.YES
        settings.blockOnBuildFailure = blockOnFail == Messages.YES
        Messages.showInfoMessage(project, "✅ 构建配置已更新", "GitPilot")
    }
}
}
