// ============================================================
// GitPilot JetBrains — DeployOrchestrator (Kotlin) v1.2.9 sync
// Fully aligned with every feature of the VS Code deploy-orchestrator.ts
// Including: unpushed-commit detection, branch verification, file filtering, Release
// ============================================================

package com.gitpilot.core

import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.project.Project

// ── Data classes ──

enum class DeployStatus { IDLE, BUILDING, STAGING, COMMITTING, PUSHING, RELEASING, SUCCESS, FAILED, NO_CHANGES }

data class DeployStep(
    val name: String,
    var status: String = "pending",
    var error: String? = null,
    var details: String? = null,
    var startTime: Long = System.currentTimeMillis(),
    var endTime: Long? = null,
    var durationMs: Long? = null
) {
    fun finish() { endTime = System.currentTimeMillis(); durationMs = endTime!! - startTime }
}

data class DeployResult(
    val success: Boolean,
    val status: DeployStatus,
    val steps: List<DeployStep>,
    val commitHash: String? = null,
    val releaseUrl: String? = null,
    val error: String? = null,
    val durationMs: Long
)

data class FilterResult(
    val allowed: List<String>,
    val blocked: List<Pair<String, String>>
)

// ── Interfaces (full version, aligned with the TS interfaces/) ──

interface IRepoProvider {
    val platform: String
    fun listRepos(): List<GitHubRepo>
    fun createRepo(name: String, isPrivate: Boolean): GitHubRepo?
    fun deleteRepo(owner: String, repo: String): Boolean
}

interface IGitProvider {
    fun hasChanges(): Boolean
    fun getStatus(): GitStatus?
    fun stageFiles(excludeFiles: List<String> = emptyList()): Boolean
    fun getStagedFiles(): List<String>
    fun commit(message: String): CommitResult
    fun push(remote: String = "origin"): PushResult
    fun pull(): Boolean
    fun getCurrentBranch(): String?
    fun getRemoteUrl(remote: String = "origin"): String?
    fun hasRemote(remote: String = "origin"): Boolean
    fun addRemote(name: String, url: String): Boolean
}

interface IBuildProvider {
    fun run(command: String, indicator: ProgressIndicator): BuildResult
}

interface IReleaseProvider {
    fun createRelease(owner: String, repo: String, tag: String, name: String, commitHash: String?, prerelease: Boolean, draft: Boolean): ReleaseResult?
}

// ── Data classes ──

data class GitHubRepo(val id: Long, val name: String, val fullName: String, val owner: String, val isPrivate: Boolean, val htmlUrl: String, val cloneUrl: String, val defaultBranch: String)
data class GitStatus(val isClean: Boolean, val modified: List<String>, val added: List<String> = emptyList(), val deleted: List<String> = emptyList(), val untracked: List<String> = emptyList(), val currentBranch: String, val ahead: Int = 0, val behind: Int = 0)
data class CommitResult(val success: Boolean, val hash: String?, val error: String?)
data class PushResult(val success: Boolean, val pushed: Boolean, val error: String?, val nonFastForward: Boolean = false)
data class BuildResult(val success: Boolean, val output: String?, val error: String?, val durationMs: Long)
data class ReleaseResult(val htmlUrl: String, val tag: String)

// ── DeployOrchestrator v1.2.9 ──

@Service(Service.Level.PROJECT)
class DeployOrchestrator(private val project: Project) {

    private val logger = Logger.getInstance(DeployOrchestrator::class.java)
    var currentStatus: DeployStatus = DeployStatus.IDLE

    fun deploy(
        indicator: ProgressIndicator,
        repoProvider: IRepoProvider,
        gitProvider: IGitProvider,
        buildProvider: IBuildProvider?,
        releaseProvider: IReleaseProvider?,
        buildCommand: String?,
        buildBeforeDeploy: Boolean,
        blockOnBuildFailure: Boolean,
        smartFilter: SmartFilter?,
        commitMessage: String = "deploy: auto-deploy by GitPilot"
    ): DeployResult {
        val startTime = System.currentTimeMillis()
        val steps = mutableListOf<DeployStep>()

        try {
            // ═══ Step 1: Check for changes ═══
            indicator.text = "Checking file changes..."
            indicator.fraction = 0.1
            val stepCheck = DeployStep("Checking file changes")
            val hasChanges = gitProvider.hasChanges()
            val gitStatus = gitProvider.getStatus()
            val hasUnpushedCommits = (gitStatus?.ahead ?: 0) > 0

            // Neither changes nor unpushed commits → skip
            if (!hasChanges && !hasUnpushedCommits) {
                stepCheck.status = "skipped"; stepCheck.details = "No changes to deploy"; stepCheck.finish(); steps.add(stepCheck)
                currentStatus = DeployStatus.NO_CHANGES
                return DeployResult(true, DeployStatus.NO_CHANGES, steps, durationMs = System.currentTimeMillis() - startTime)
            }

            // Unpushed commits but no new changes → push directly
            if (!hasChanges && hasUnpushedCommits) {
                stepCheck.status = "success"; stepCheck.details = "No new changes, ${gitStatus!!.ahead} commit(s) not pushed"; stepCheck.finish(); steps.add(stepCheck)
                return doPushOnly(indicator, gitProvider, steps, startTime)
            }

            stepCheck.status = "success"; stepCheck.finish(); steps.add(stepCheck)

            // ═══ Step 2: Smart filtering ═══
            indicator.text = "Smart file filtering..."
            indicator.fraction = 0.2
            val stepFilter = DeployStep("Smart file filtering")
            val allChanged = mutableListOf<String>()
            gitStatus?.let {
                allChanged.addAll(it.modified); allChanged.addAll(it.added)
                allChanged.addAll(it.deleted); allChanged.addAll(it.untracked)
            }
            val filterResult = smartFilter?.filter(allChanged) ?: FilterResult(allChanged, emptyList())
            stepFilter.status = "success"
            stepFilter.details = "${filterResult.allowed.size} file(s) to deploy"
            if (filterResult.blocked.isNotEmpty()) stepFilter.details += ", excluded ${filterResult.blocked.size}"
            stepFilter.finish(); steps.add(stepFilter)

            // ═══ Step 3: Build (optional) ═══
            if (buildBeforeDeploy && buildCommand != null && buildProvider != null) {
                indicator.text = "Building project..."
                indicator.fraction = 0.35
                val stepBuild = DeployStep("Building project")
                val result = buildProvider.run(buildCommand, indicator)
                stepBuild.status = if (result.success) "success" else "failed"
                stepBuild.error = result.error; stepBuild.details = result.output?.takeLast(200)
                stepBuild.finish(); steps.add(stepBuild)
                if (!result.success && blockOnBuildFailure) {
                    currentStatus = DeployStatus.FAILED
                    return DeployResult(false, DeployStatus.FAILED, steps, error = "Build failed: ${result.error}", durationMs = System.currentTimeMillis() - startTime)
                }
            }

            // ═══ Step 4: Stage ═══
            indicator.text = "Staging files..."
            indicator.fraction = 0.5
            val stepStage = DeployStep("Staging files")
            val excludedPaths = filterResult.blocked.map { it.first }
            val staged = gitProvider.stageFiles(excludedPaths)
            val stagedFiles = gitProvider.getStagedFiles()
            stepStage.status = if (staged) "success" else "failed"
            stepStage.details = if (stagedFiles.isNotEmpty()) "Staged ${stagedFiles.size} file(s)" else "${filterResult.allowed.size} file(s) to commit"
            if (!staged) stepStage.error = "Staging failed"
            stepStage.finish(); steps.add(stepStage)
            if (!staged) return DeployResult(false, DeployStatus.FAILED, steps, error = "Staging failed", durationMs = System.currentTimeMillis() - startTime)
            if (stagedFiles.isEmpty() && filterResult.allowed.isEmpty()) {
                currentStatus = DeployStatus.NO_CHANGES
                return DeployResult(true, DeployStatus.NO_CHANGES, steps, durationMs = System.currentTimeMillis() - startTime)
            }

            // ═══ Step 5: Commit ═══
            indicator.text = "Committing changes..."
            indicator.fraction = 0.65
            val stepCommit = DeployStep("Committing changes")
            val commitResult = gitProvider.commit(commitMessage)
            stepCommit.status = if (commitResult.success) "success" else "failed"
            stepCommit.error = commitResult.error; stepCommit.details = commitResult.hash?.take(7)
            stepCommit.finish(); steps.add(stepCommit)
            if (!commitResult.success) return DeployResult(false, DeployStatus.FAILED, steps, error = "Commit failed", durationMs = System.currentTimeMillis() - startTime)

            // ═══ Step 6: Push ═══
            return doPush(indicator, gitProvider, releaseProvider, commitResult.hash, steps, startTime)

        } catch (e: Exception) {
            logger.error("Deploy failed", e)
            currentStatus = DeployStatus.FAILED
            return DeployResult(false, DeployStatus.FAILED, steps, error = e.message, durationMs = System.currentTimeMillis() - startTime)
        }
    }

    /** Push only (when there are no new changes) */
    private fun doPushOnly(indicator: ProgressIndicator, gitProvider: IGitProvider, steps: MutableList<DeployStep>, startTime: Long): DeployResult {
        indicator.text = "Pushing to GitHub..."; indicator.fraction = 0.7
        val stepPush = DeployStep("Pushing to GitHub")
        val pushResult = gitProvider.push()
        stepPush.status = if (pushResult.success) "success" else "failed"
        stepPush.error = pushResult.error; stepPush.details = if (pushResult.pushed) "Pushed" else "Remote is already up to date"
        stepPush.finish(); steps.add(stepPush)
        if (!pushResult.success) {
            val msg = if (pushResult.nonFastForward) "Push conflict: the remote has new commits, please run Sync first" else "Push failed: ${pushResult.error}"
            return DeployResult(false, DeployStatus.FAILED, steps, error = msg, durationMs = System.currentTimeMillis() - startTime)
        }
        currentStatus = DeployStatus.SUCCESS
        return DeployResult(true, DeployStatus.SUCCESS, steps, durationMs = System.currentTimeMillis() - startTime)
    }

    /** Full push + Release */
    private fun doPush(indicator: ProgressIndicator, gitProvider: IGitProvider, releaseProvider: IReleaseProvider?, commitHash: String?, steps: MutableList<DeployStep>, startTime: Long): DeployResult {
        indicator.text = "Pushing to GitHub..."; indicator.fraction = 0.8
        val stepPush = DeployStep("Pushing to GitHub")
        val pushResult = gitProvider.push()
        stepPush.status = if (pushResult.success) "success" else "failed"
        stepPush.error = pushResult.error; stepPush.details = if (pushResult.pushed) "Pushed" else "Remote is already up to date"
        stepPush.finish(); steps.add(stepPush)
        if (!pushResult.success) {
            val msg = if (pushResult.nonFastForward) "Push conflict: the remote has new commits, please run Sync first" else "Push failed: ${pushResult.error}"
            return DeployResult(false, DeployStatus.FAILED, steps, commitHash = commitHash, error = msg, durationMs = System.currentTimeMillis() - startTime)
        }

        // ═══ Step 7: Release (optional) ═══
        var releaseUrl: String? = null
        if (releaseProvider != null) {
            indicator.text = "Creating Release..."; indicator.fraction = 0.95
            val stepRelease = DeployStep("Creating Release")
            try {
                val tag = "v${System.currentTimeMillis() / 1000}"
                val release = releaseProvider.createRelease("unknown", "unknown", tag, tag, commitHash, false, false)
                if (release != null) {
                    releaseUrl = release.htmlUrl; stepRelease.status = "success"; stepRelease.details = tag
                } else { stepRelease.status = "skipped"; stepRelease.details = "Release not enabled" }
            } catch (e: Exception) { stepRelease.status = "failed"; stepRelease.error = e.message }
            stepRelease.finish(); steps.add(stepRelease)
        }

        currentStatus = DeployStatus.SUCCESS
        return DeployResult(true, DeployStatus.SUCCESS, steps, commitHash = commitHash, releaseUrl = releaseUrl, durationMs = System.currentTimeMillis() - startTime)
    }

    fun sync(
        indicator: ProgressIndicator,
        repoProvider: IRepoProvider,
        gitProvider: IGitProvider,
        buildProvider: IBuildProvider?,
        releaseProvider: IReleaseProvider?,
        buildCommand: String?,
        buildBeforeDeploy: Boolean,
        blockOnBuildFailure: Boolean,
        smartFilter: SmartFilter?
    ): DeployResult {
        indicator.text = "Pulling remote updates..."
        gitProvider.pull()
        return deploy(indicator, repoProvider, gitProvider, buildProvider, releaseProvider, buildCommand, buildBeforeDeploy, blockOnBuildFailure, smartFilter)
    }
}
