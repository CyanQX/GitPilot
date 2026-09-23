// ============================================================
// GitPilot JetBrains — BuildProvider (Kotlin)
// Runs the user-defined build command (aligned with VS Code vscode-build-provider.ts)
// ============================================================

package com.gitpilot.core

import com.intellij.openapi.progress.ProgressIndicator
import java.io.File
import java.util.concurrent.TimeUnit

class BuildProvider : IBuildProvider {

    override fun run(command: String, indicator: ProgressIndicator): BuildResult {
        val startTime = System.currentTimeMillis()
        return try {
            indicator.text = "Running: $command"

            val process = ProcessBuilder()
                .command(getShellCommand(command))
                .directory(File(indicator.getUserDataOrNull() ?: System.getProperty("user.dir")))
                .redirectErrorStream(true)
                .start()

            val output = StringBuilder()
            val reader = process.inputStream.bufferedReader()

            // Read the output while checking for cancellation
            var line: String?
            while (reader.readLine().also { line = it } != null) {
                if (indicator.isCanceled) {
                    process.destroyForcibly()
                    return BuildResult(false, output.toString(), "Cancelled by the user", System.currentTimeMillis() - startTime)
                }
                output.appendLine(line)
                indicator.text2 = line?.take(80) ?: ""
            }

            val exited = process.waitFor(5, TimeUnit.MINUTES)
            if (!exited) {
                process.destroyForcibly()
                return BuildResult(false, output.toString(), "Build timed out (5 minutes)", System.currentTimeMillis() - startTime)
            }

            val success = process.exitValue() == 0
            BuildResult(success, output.toString(), if (success) null else "Exit code: ${process.exitValue()}", System.currentTimeMillis() - startTime)

        } catch (e: Exception) {
            BuildResult(false, null, "Build error: ${e.message}", System.currentTimeMillis() - startTime)
        }
    }

    private fun getShellCommand(command: String): List<String> {
        val os = System.getProperty("os.name").lowercase()
        return if (os.contains("win")) listOf("cmd", "/c", command)
        else listOf("sh", "-c", command)
    }
}

/** ProgressIndicator extension: get user data */
private fun ProgressIndicator.getUserDataOrNull(): String? {
    return try {
        this::class.java.getMethod("getUserData").invoke(this) as? String
    } catch (_: Exception) { null }
}
