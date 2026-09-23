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
    private val loginLabel = JLabel("Not signed in")
    private val repoLabel = JLabel("--")
    private val branchLabel = JLabel("--")
    private val statusLabel = JLabel("Ready")
    private val deployBtn = JButton("🚀 Deploy")
    private val syncBtn = JButton("🔄 Sync")
    private val loginBtn = JButton("Login with GitHub")
    private val buildLabel = JLabel("Not configured")

    init {
        layout = BoxLayout(this, BoxLayout.Y_AXIS)
        border = BorderFactory.createEmptyBorder(8, 8, 8, 8)

        // Login status
        val loginPanel = JPanel(BorderLayout())
        loginPanel.add(loginLabel, BorderLayout.CENTER)
        loginPanel.add(loginBtn, BorderLayout.EAST)
        loginPanel.maximumSize = Dimension(Int.MAX_VALUE, 30)
        add(loginPanel); add(Box.createVerticalStrut(8))

        // Repository info
        val repoPanel = JPanel(BorderLayout())
        repoPanel.border = BorderFactory.createTitledBorder("📦 Current repository")
        val info = JPanel(); info.layout = BoxLayout(info, BoxLayout.Y_AXIS)
        info.add(repoLabel); info.add(branchLabel)
        repoPanel.add(info, BorderLayout.CENTER)
        repoPanel.maximumSize = Dimension(Int.MAX_VALUE, 60)
        add(repoPanel); add(Box.createVerticalStrut(8))

        // Action buttons
        val btnPanel = JPanel(GridLayout(1, 2, 8, 0))
        deployBtn.addActionListener { doDeploy() }
        syncBtn.addActionListener { doSync() }
        loginBtn.addActionListener { doLogin() }
        btnPanel.add(deployBtn); btnPanel.add(syncBtn)
        btnPanel.maximumSize = Dimension(Int.MAX_VALUE, 40)
        add(btnPanel); add(Box.createVerticalStrut(8))

        // Build command
        val buildPanel = JPanel(BorderLayout())
        buildPanel.border = BorderFactory.createTitledBorder("🔨 Build command")
        buildPanel.add(buildLabel, BorderLayout.CENTER)
        buildPanel.maximumSize = Dimension(Int.MAX_VALUE, 40)
        add(buildPanel); add(Box.createVerticalStrut(8))

        // Status
        val stPanel = JPanel(BorderLayout())
        stPanel.add(JLabel("Status: "), BorderLayout.WEST)
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
                if (result.success) Messages.showInfoMessage(project, "🚀 Deployed!", "GitPilot")
                else Messages.showErrorDialog(project, "Deploy failed: ${result.error}", "GitPilot")
                refreshUI()
            }
        }, "GitPilot deploying...", true, project)
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
                if (result.success) Messages.showInfoMessage(project, "🔄 Sync complete!", "GitPilot")
                else Messages.showErrorDialog(project, "Sync failed: ${result.error}", "GitPilot")
                refreshUI()
            }
        }, "GitPilot syncing...", true, project)
    }

    private fun doLogin() {
        val token = Messages.showPasswordDialog(project, "Enter your GitHub Personal Access Token\n(requires repo + workflow scopes)", "GitPilot Login", null)
        if (token.isNullOrEmpty()) return

        val repoProvider = GitHubRepoProvider(token)
        if (!repoProvider.validateToken()) {
            Messages.showErrorDialog(project, "Invalid token", "GitPilot"); return
        }

        val user = repoProvider.getCurrentUser()
        GitPilotSettings.saveToken(user ?: "unknown", token)
        settings.activeAccount = user ?: "unknown"
        refreshUI()
        Messages.showInfoMessage(project, "✅ Signed in: $user", "GitPilot")
    }

    private fun refreshUI() {
        val hasToken = GitPilotSettings.getActiveToken() != null
        loginLabel.text = if (hasToken) "✔ GitHub signed in" else "Not signed in"
        loginLabel.foreground = if (hasToken) Color(0x4E, 0xC9, 0xB0) else Color.GRAY
        loginBtn.isVisible = !hasToken
        deployBtn.isEnabled = hasToken
        syncBtn.isEnabled = hasToken
        buildLabel.text = settings.buildCommand.ifEmpty { "Not configured" }

        val gitProvider = project.getService(IntelliJGitProvider::class.java)
        branchLabel.text = "🌿 ${gitProvider.getCurrentBranch() ?: "--"}"
        val hasChanges = gitProvider.hasChanges()
        statusLabel.text = if (hasChanges) "📝 Pending changes to deploy" else "✅ Ready"
        statusLabel.foreground = if (hasChanges) Color(0xE2, 0xB7, 0x14) else Color(0x4E, 0xC9, 0xB0)
    }
}
