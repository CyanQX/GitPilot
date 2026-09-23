// ============================================================
// GitPilot JetBrains — SmartFilter (Kotlin)
// Smart file filtering: .gitignore + built-in rules + secret detection
// Fully aligned with VS Code smart-filter.ts
// ============================================================

package com.gitpilot.core

import java.io.File

class SmartFilter(workspaceRoot: String, blockSecrets: Boolean = true) {

    private val ignorePatterns = mutableListOf<String>()

    init {
        // Built-in ignores
        ignorePatterns.addAll(BUILTIN_IGNORES)
        // Load .gitignore
        val gitignore = File(workspaceRoot, ".gitignore")
        if (gitignore.exists()) {
            gitignore.readLines().forEach { line ->
                val trimmed = line.trim()
                if (trimmed.isNotEmpty() && !trimmed.startsWith("#")) {
                    ignorePatterns.add(trimmed)
                }
            }
        }
        // Secret files
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
            basename.startsWith(".env") -> "Environment variable file"
            basename.endsWith(".pem") || basename.endsWith(".key") -> "Key file"
            filePath.contains("node_modules/") -> "Dependency directory"
            filePath.contains(".git/") -> "Git internal file"
            filePath.contains("dist/") || filePath.contains("build/") -> "Build artifact"
            else -> "Matched an ignore rule"
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
