// ============================================================
// GitPilot JetBrains — GitHubReleaseProvider (Kotlin)
// GitHub Release 创建（对标 VS Code provider-github/GitHubReleaseProvider.ts）
// ============================================================

package com.gitpilot.core

import com.google.gson.Gson
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

class GitHubReleaseProvider(token: String) : IReleaseProvider {

    private val gson = Gson()
    private val baseUrl = "https://api.github.com"
    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()
    private var myToken = token

    fun setToken(token: String) { myToken = token }

    override fun createRelease(
        owner: String, repo: String,
        tag: String, name: String,
        commitHash: String?,
        prerelease: Boolean, draft: Boolean
    ): ReleaseResult? {
        val body = mapOf(
            "tag_name" to tag,
            "name" to name,
            "body" to "🚀 Auto-release by GitPilot",
            "prerelease" to prerelease,
            "draft" to draft,
            "target_commitish" to (commitHash ?: "main")
        )
        val json = gson.toJson(body)
        val res = post("/repos/$owner/$repo/releases", json) ?: return null
        if (!res.isSuccessful) return null
        val data = gson.fromJson(res.body?.string() ?: return null, Map::class.java)
        return ReleaseResult(
            htmlUrl = data["html_url"] as String,
            tag = data["tag_name"] as String
        )
    }

    private fun post(path: String, json: String): Response? = try {
        client.newCall(Request.Builder().url("$baseUrl$path")
            .header("Authorization", "Bearer $myToken")
            .header("Accept", "application/vnd.github+json")
            .post(json.toRequestBody("application/json".toMediaType())).build()).execute()
    } catch (_: Exception) { null }
}
