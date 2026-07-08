// ============================================================
// GitPilot JetBrains — BuildProvider (Kotlin)
// 执行用户自定义构建命令（对标 VS Code vscode-build-provider.ts）
// ============================================================

package com.gitpilot.core

import com.intellij.openapi.progress.ProgressIndicator
import java.io.File
import java.util.concurrent.TimeUnit

class BuildProvider : IBuildProvider {

    override fun run(command: String, indicator: ProgressIndicator): BuildResult {
        val startTime = System.currentTimeMillis()
        return try {
            indicator.text = "执行: $command"

            val process = ProcessBuilder()
                .command(getShellCommand(command))
                .directory(File(indicator.getUserDataOrNull() ?: System.getProperty("user.dir")))
                .redirectErrorStream(true)
                .start()

            val output = StringBuilder()
            val reader = process.inputStream.bufferedReader()

            // 读取输出，同时检查是否取消
            var line: String?
            while (reader.readLine().also { line = it } != null) {
                if (indicator.isCanceled) {
                    process.destroyForcibly()
                    return BuildResult(false, output.toString(), "用户取消", System.currentTimeMillis() - startTime)
                }
                output.appendLine(line)
                indicator.text2 = line?.take(80) ?: ""
            }

            val exited = process.waitFor(5, TimeUnit.MINUTES)
            if (!exited) {
                process.destroyForcibly()
                return BuildResult(false, output.toString(), "构建超时（5分钟）", System.currentTimeMillis() - startTime)
            }

            val success = process.exitValue() == 0
            BuildResult(success, output.toString(), if (success) null else "退出码: ${process.exitValue()}", System.currentTimeMillis() - startTime)

        } catch (e: Exception) {
            BuildResult(false, null, "构建异常: ${e.message}", System.currentTimeMillis() - startTime)
        }
    }

    private fun getShellCommand(command: String): List<String> {
        val os = System.getProperty("os.name").lowercase()
        return if (os.contains("win")) listOf("cmd", "/c", command)
        else listOf("sh", "-c", command)
    }
}

/** ProgressIndicator 扩展：获取用户数据 */
private fun ProgressIndicator.getUserDataOrNull(): String? {
    return try {
        this::class.java.getMethod("getUserData").invoke(this) as? String
    } catch (_: Exception) { null }
}
