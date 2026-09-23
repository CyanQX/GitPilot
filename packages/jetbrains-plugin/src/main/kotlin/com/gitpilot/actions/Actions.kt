// ============================================================
// GitPilot Actions (Kotlin) v1.2.9
// Fully aligned with the VS Code extension.ts commands
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

// ── Helpers ──
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
        val (rp, gp, orch) = getProviders(project) ?: run { Messages.showWarningDialog(project, "Please sign in to GitHub first", "GitPilot"); return }
        val (bp, sf) = getBuildAndFilter(project)
        val settings = GitPilotSettings.instance

        ProgressManager.getInstance().runProcessWithProgressSynchronously({
            val result = orch.deploy(it, rp, gp, bp, null,
                settings.buildCommand.ifEmpty { null },
                settings.buildBeforeDeploy, settings.blockOnBuildFailure, sf,
                settings.commitMessageTemplate)
            ApplicationManager.getApplication().invokeLater {
                if (result.success) {
                    val stageStep = result.steps.find { s -> s.name == "Staging files" }
                    val info = stageStep?.details ?: ""
                    Messages.showInfoMessage(project, "🚀 Deployed! $info", "GitPilot")
                } else Messages.showErrorDialog(project, result.error ?: "Deploy failed", "GitPilot")
            }
        }, "GitPilot deploying...", true, project)
    }
    override fun update(e: AnActionEvent) {
        e.presentation.isEnabled = e.project != null && GitPilotSettings.getActiveToken() != null
    }
}

// ── Sync ──
class SyncAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val (rp, gp, orch) = getProviders(project) ?: run { Messages.showWarningDialog(project, "Please sign in to GitHub first", "GitPilot"); return }
        val (bp, sf) = getBuildAndFilter(project)
        val settings = GitPilotSettings.instance

        ProgressManager.getInstance().runProcessWithProgressSynchronously({
            val result = orch.sync(it, rp, gp, bp, null,
                settings.buildCommand.ifEmpty { null },
                settings.buildBeforeDeploy, settings.blockOnBuildFailure, sf)
            ApplicationManager.getApplication().invokeLater {
                if (result.success) Messages.showInfoMessage(project, "🔄 Sync complete!", "GitPilot")
                else Messages.showErrorDialog(project, result.error ?: "Sync failed", "GitPilot")
            }
        }, "GitPilot syncing...", true, project)
    }
    override fun update(e: AnActionEvent) {
        e.presentation.isEnabled = e.project != null && GitPilotSettings.getActiveToken() != null
    }
}

// ── Login ──
class LoginAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val token = Messages.showPasswordDialog(project, "Enter your GitHub Personal Access Token\n(requires repo + workflow scopes)\nCreate one at: https://github.com/settings/tokens", "GitPilot · Sign in", null)
        if (token.isNullOrEmpty()) return
        val rp = GitHubRepoProvider(token)
        if (!rp.validateToken()) { Messages.showErrorDialog(project, "Invalid token. Please check the scopes.", "GitPilot"); return }
        val user = rp.getCurrentUser()
        GitPilotSettings.saveToken(user ?: "unknown", token)
        GitPilotSettings.instance.activeAccount = user ?: "unknown"
        Messages.showInfoMessage(project, "✅ Signed in: $user", "GitPilot")
    }
    override fun update(e: AnActionEvent) {
        e.presentation.isEnabledAndVisible = GitPilotSettings.getActiveToken() == null
    }
}

// ── Logout ──
class LogoutAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        if (Messages.showYesNoDialog(project, "Sign out?", "GitPilot", Messages.getWarningIcon()) == Messages.YES) {
            val login = GitPilotSettings.instance.activeAccount
            if (login.isNotEmpty()) GitPilotSettings.deleteToken(login)
            GitPilotSettings.instance.activeAccount = ""
            Messages.showInfoMessage(project, "Signed out", "GitPilot")
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
        val token = GitPilotSettings.getActiveToken() ?: run { Messages.showWarningDialog(project, "Please sign in first", "GitPilot"); return }
        val name = Messages.showInputDialog(project, "Repository name", "GitPilot · Create repository", null) ?: return
        val isPrivate = Messages.showYesNoDialog(project, "Make it private?", "GitPilot", Messages.getQuestionIcon()) == Messages.YES
        val rp = GitHubRepoProvider(token)
        val repo = rp.createRepo(name, isPrivate)
        if (repo != null) {
            // Set the git remote automatically
            val gp = project.getService(IntelliJGitProvider::class.java)
            if (!gp.hasRemote("origin")) {
                gp.addRemote("origin", repo.cloneUrl)
            }
            Messages.showInfoMessage(project, "✅ Created: ${repo.fullName}\nLocal git remote linked", "GitPilot")
        } else Messages.showErrorDialog(project, "Create failed", "GitPilot")
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
        if (repos.isEmpty()) { Messages.showInfoMessage(project, "No repositories available", "GitPilot"); return }

        val names = repos.map { it.fullName }.toTypedArray()
        val chosen = Messages.showEditableChooseDialog("Choose a GitHub repository to link", "GitPilot · Switch repository", null, names, names.firstOrNull(), null)
        if (chosen == -1) return
        val repo = repos[chosen]
        val gp = project.getService(IntelliJGitProvider::class.java)
        if (!gp.hasRemote("origin")) gp.addRemote("origin", repo.cloneUrl)
        Messages.showInfoMessage(project, "✅ Switched to: ${repo.fullName}", "GitPilot")
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
        val cmd = Messages.showInputDialog(project, "Enter the build command\n(npm run build / cargo build / ...)", "GitPilot", null, settings.buildCommand, null) ?: return
        val beforeDeploy = Messages.showYesNoDialog(project, "Run Build before deploy?", "GitPilot", Messages.getQuestionIcon())
        val blockOnFail = Messages.showYesNoDialog(project, "Block the deploy when Build fails?", "GitPilot", Messages.getQuestionIcon())
        settings.buildCommand = cmd
        settings.buildBeforeDeploy = beforeDeploy == Messages.YES
        settings.blockOnBuildFailure = blockOnFail == Messages.YES
        Messages.showInfoMessage(project, "✅ Build configuration updated", "GitPilot")
    }
}
