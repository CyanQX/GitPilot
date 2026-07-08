// ============================================================
// GitPilot ToolWindow (Kotlin) — UI Panel
// ============================================================

package com.gitpilot.ui

import com.gitpilot.core.*
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.content.ContentFactory
import java.awt.*
import javax.swing.*

class GitPilotToolWindowFactory : ToolWindowFactory {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val panel = GitPilotPanel(project)
        toolWindow.contentManager.addContent(
            ContentFactory.getInstance().createContent(panel, "", false)
        )
    }
}

class GitPilotPanel(private val project: Project) : JPanel(BorderLayout()) {

    private val settings = GitPilotSettings.instance
    private val loginLabel = JLabel("未登录")
    private val repoLabel = JLabel("--")
    private val branchLabel = JLabel("--")
    private val statusLabel = JLabel("就绪")
    private val deployBtn = JButton("🚀 Deploy")
    private val syncBtn = JButton("🔄 Sync")
    private val loginBtn = JButton("Login with GitHub")
    private val buildLabel = JLabel("未配置")

    init {
        layout = BoxLayout(this, BoxLayout.Y_AXIS)
        border = BorderFactory.createEmptyBorder(8, 8, 8, 8)

        // 登录状态
        val loginPanel = JPanel(BorderLayout())
        loginPanel.add(loginLabel, BorderLayout.CENTER)
        loginPanel.add(loginBtn, BorderLayout.EAST)
        loginPanel.maximumSize = Dimension(Int.MAX_VALUE, 30)
        add(loginPanel); add(Box.createVerticalStrut(8))

        // 仓库信息
        val repoPanel = JPanel(BorderLayout())
        repoPanel.border = BorderFactory.createTitledBorder("📦 当前仓库")
        val info = JPanel(); info.layout = BoxLayout(info, BoxLayout.Y_AXIS)
        info.add(repoLabel); info.add(branchLabel)
        repoPanel.add(info, BorderLayout.CENTER)
        repoPanel.maximumSize = Dimension(Int.MAX_VALUE, 60)
        add(repoPanel); add(Box.createVerticalStrut(8))

        // 操作按钮
        val btnPanel = JPanel(GridLayout(1, 2, 8, 0))
        deployBtn.addActionListener { doDeploy() }
        syncBtn.addActionListener { doSync() }
        loginBtn.addActionListener { doLogin() }
        btnPanel.add(deployBtn); btnPanel.add(syncBtn)
        btnPanel.maximumSize = Dimension(Int.MAX_VALUE, 40)
        add(btnPanel); add(Box.createVerticalStrut(8))

        // 构建命令
        val buildPanel = JPanel(BorderLayout())
        buildPanel.border = BorderFactory.createTitledBorder("🔨 构建命令")
        buildPanel.add(buildLabel, BorderLayout.CENTER)
        buildPanel.maximumSize = Dimension(Int.MAX_VALUE, 40)
        add(buildPanel); add(Box.createVerticalStrut(8))

        // 状态
        val stPanel = JPanel(BorderLayout())
        stPanel.add(JLabel("状态: "), BorderLayout.WEST)
        stPanel.add(statusLabel, BorderLayout.CENTER)
        stPanel.maximumSize = Dimension(Int.MAX_VALUE, 30)
        add(stPanel)

        refreshUI()
    }

    private fun doDeploy() {
        val gitProvider = project.getService(IntelliJGitProvider::class.java)
        val orchestrator = project.getService(DeployOrchestrator::class.java)
        val repoProvider = GitHubRepoProvider(GitPilotSettings.getActiveToken() ?: return)

        ProgressManager.getInstance().runProcessWithProgressSynchronously({
            val result = orchestrator.deploy(
                it, repoProvider, gitProvider, null,
                settings.buildCommand.ifEmpty { null },
                settings.buildBeforeDeploy, settings.blockOnBuildFailure,
                settings.commitMessageTemplate
            )
            ApplicationManager.getApplication().invokeLater {
                if (result.success) Messages.showInfoMessage(project, "🚀 部署成功！", "GitPilot")
                else Messages.showErrorDialog(project, "部署失败: ${result.error}", "GitPilot")
                refreshUI()
            }
        }, "GitPilot 部署中...", true, project)
    }

    private fun doSync() {
        val gitProvider = project.getService(IntelliJGitProvider::class.java)
        val orchestrator = project.getService(DeployOrchestrator::class.java)
        val repoProvider = GitHubRepoProvider(GitPilotSettings.getActiveToken() ?: return)

        ProgressManager.getInstance().runProcessWithProgressSynchronously({
            val result = orchestrator.sync(
                it, repoProvider, gitProvider, null,
                settings.buildCommand.ifEmpty { null },
                settings.buildBeforeDeploy, settings.blockOnBuildFailure
            )
            ApplicationManager.getApplication().invokeLater {
                if (result.success) Messages.showInfoMessage(project, "🔄 同步完成！", "GitPilot")
                else Messages.showErrorDialog(project, "同步失败: ${result.error}", "GitPilot")
                refreshUI()
            }
        }, "GitPilot 同步中...", true, project)
    }

    private fun doLogin() {
        val token = Messages.showPasswordDialog(project, "输入 GitHub Personal Access Token\n(需要 repo + workflow 权限)", "GitPilot Login", null)
        if (token.isNullOrEmpty()) return

        val repoProvider = GitHubRepoProvider(token)
        if (!repoProvider.validateToken()) {
            Messages.showErrorDialog(project, "Token 无效", "GitPilot"); return
        }

        val user = repoProvider.getCurrentUser()
        GitPilotSettings.saveToken(user ?: "unknown", token)
        settings.activeAccount = user ?: "unknown"
        refreshUI()
        Messages.showInfoMessage(project, "✅ 已登录: $user", "GitPilot")
    }

    private fun refreshUI() {
        val hasToken = GitPilotSettings.getActiveToken() != null
        loginLabel.text = if (hasToken) "✔ GitHub 已登录" else "未登录"
        loginLabel.foreground = if (hasToken) Color(0x4E, 0xC9, 0xB0) else Color.GRAY
        loginBtn.isVisible = !hasToken
        deployBtn.isEnabled = hasToken
        syncBtn.isEnabled = hasToken
        buildLabel.text = settings.buildCommand.ifEmpty { "未配置" }

        val gitProvider = project.getService(IntelliJGitProvider::class.java)
        branchLabel.text = "🌿 ${gitProvider.getCurrentBranch() ?: "--"}"
        val hasChanges = gitProvider.hasChanges()
        statusLabel.text = if (hasChanges) "📝 有待部署的变更" else "✅ 就绪"
        statusLabel.foreground = if (hasChanges) Color(0xE2, 0xB7, 0x14) else Color(0x4E, 0xC9, 0xB0)
    }
}
