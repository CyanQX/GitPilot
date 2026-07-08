// ============================================================
// GitPilot JetBrains — SmartFilter (Kotlin)
// 智能文件过滤：.gitignore + 内置规则 + 密钥检测
// 完全对标 VS Code smart-filter.ts
// ============================================================

package com.gitpilot.core

import java.io.File

class SmartFilter(workspaceRoot: String, blockSecrets: Boolean = true) {

    private val ignorePatterns = mutableListOf<String>()

    init {
        // 内置忽略
        ignorePatterns.addAll(BUILTIN_IGNORES)
        // 加载 .gitignore
        val gitignore = File(workspaceRoot, ".gitignore")
        if (gitignore.exists()) {
            gitignore.readLines().forEach { line ->
                val trimmed = line.trim()
                if (trimmed.isNotEmpty() && !trimmed.startsWith("#")) {
                    ignorePatterns.add(trimmed)
                }
            }
        }
        // 密钥文件
        if (blockSecrets) ignorePatterns.addAll(SECRET_FILES)
    }

    fun filter(files: List<String>): FilterResult {
        val allowed = mutableListOf<String>()
        val blocked = mutableListOf<Pair<String, String>>()
        for (file in files) {
            if (shouldIgnore(file)) {
                blocked.add(Pair(file, getReason(file)))
            } else {
                allowed.add(file)
            }
        }
        return FilterResult(allowed, blocked)
    }

    fun shouldIgnore(filePath: String): Boolean {
        val basename = File(filePath).name
        for (pattern in ignorePatterns) {
            if (matchSimple(pattern, basename) || matchSimple(pattern, filePath)) return true
        }
        return false
    }

    private fun matchSimple(pattern: String, target: String): Boolean {
        if (pattern == target) return true
        if (pattern.endsWith("/") && target.startsWith(pattern)) return true
        if (pattern.startsWith("*.")) return target.endsWith(pattern.substring(1))
        if (pattern.contains("*")) {
            val regex = Regex("^" + Regex.escape(pattern).replace("\\*", ".*") + "$")
            return regex.matches(target)
        }
        return target.contains(pattern)
    }

    private fun getReason(filePath: String): String {
        val basename = File(filePath).name
        return when {
            basename.startsWith(".env") -> "环境变量文件"
            basename.endsWith(".pem") || basename.endsWith(".key") -> "密钥文件"
            filePath.contains("node_modules/") -> "依赖目录"
            filePath.contains(".git/") -> "Git 内部文件"
            filePath.contains("dist/") || filePath.contains("build/") -> "构建产物"
            else -> "匹配忽略规则"
        }
    }

    companion object {
        val BUILTIN_IGNORES = listOf(
            "node_modules/", ".git/", ".vscode/", ".idea/",
            "dist/", "build/", "out/", "target/",
            "cache/", "logs/", "temp/", "tmp/",
            "*.log", "*.tmp", ".DS_Store", "Thumbs.db"
        )
        val SECRET_FILES = listOf(
            ".env", ".env.local", ".env.production",
            "*.pem", "*.key", "*.p12", "*.pfx",
            "*.keystore", "*.jks", "credentials.json",
            "service-account.json", "secrets.yml", "secrets.yaml"
        )
    }
}
