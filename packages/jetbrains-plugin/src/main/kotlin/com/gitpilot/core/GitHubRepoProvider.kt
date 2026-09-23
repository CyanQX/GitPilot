// ============================================================
// GitHubRepoProvider (Kotlin) — implements IRepoProvider
// Corresponds to the TS provider-github/GitHubRepositoryProvider.ts
// ============================================================

package com.gitpilot.core

import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

class GitHubRepoProvider(private var token: String) : IRepoProvider {

    override val platform = "github"

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    private val gson = Gson()
    private val baseUrl = "https://api.github.com"

    override fun listRepos(): List<GitHubRepo> {
        val res = get("/user/repos?sort=updated&per_page=100") ?: return emptyList()
        val body = res.body?.string() ?: return emptyList()
        val listType = object : TypeToken<List<Map<String, Any>>>() {}.type
        val list: List<Map<String, Any>> = gson.fromJson(body, listType)
        return list.map { mapRepo(it) }
    }

    override fun createRepo(name: String, isPrivate: Boolean): GitHubRepo? {
        val json = gson.toJson(mapOf("name" to name, "private" to isPrivate, "auto_init" to true))
        val res = post("/user/repos", json) ?: return null
        val body = res.body?.string() ?: return null
        return mapRepo(gson.fromJson(body, Map::class.java))
    }

    override fun deleteRepo(owner: String, repo: String): Boolean {
        val res = delete("/repos/$owner/$repo")
        return res?.isSuccessful == true
    }

    fun setToken(token: String) { this.token = token }

    fun validateToken(): Boolean {
        val res = get("/user")
        return res?.isSuccessful == true
    }

    fun getCurrentUser(): String? {
        val res = get("/user") ?: return null
        val body = res.body?.string() ?: return null
        val json = gson.fromJson(body, Map::class.java)
        return json["login"] as? String
    }

    // HTTP helpers
    private fun get(path: String): Response? = try {
        client.newCall(Request.Builder().url("$baseUrl$path")
            .header("Authorization", "Bearer $token")
            .header("Accept", "application/vnd.github+json").get().build()).execute()
    } catch (_: Exception) { null }

    private fun post(path: String, json: String): Response? = try {
        client.newCall(Request.Builder().url("$baseUrl$path")
            .header("Authorization", "Bearer $token")
            .header("Accept", "application/vnd.github+json")
            .post(json.toRequestBody("application/json".toMediaType())).build()).execute()
    } catch (_: Exception) { null }

    private fun delete(path: String): Response? = try {
        client.newCall(Request.Builder().url("$baseUrl$path")
            .header("Authorization", "Bearer $token").delete().build()).execute()
    } catch (_: Exception) { null }

    private fun mapRepo(json: Map<String, Any>): GitHubRepo = GitHubRepo(
        id = (json["id"] as Double).toLong(),
        name = json["name"] as String,
        fullName = json["full_name"] as String,
        owner = (json["owner"] as Map<String, Any>)["login"] as String,
        isPrivate = json["private"] as Boolean,
        htmlUrl = json["html_url"] as String,
        cloneUrl = json["clone_url"] as String,
        defaultBranch = json["default_branch"] as? String ?: "main"
    )
}
