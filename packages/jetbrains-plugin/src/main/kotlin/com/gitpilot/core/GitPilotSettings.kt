// ============================================================
// GitPilotSettings (Kotlin) — persistent settings
// Uses IntelliJ PasswordSafe for secure token storage
// ============================================================

package com.gitpilot.core

import com.intellij.credentialStore.CredentialAttributes
import com.intellij.credentialStore.Credentials
import com.intellij.ide.passwordSafe.PasswordSafe
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.*

@State(name = "GitPilotSettings", storages = [Storage("gitpilot.xml")])
@Service(Service.Level.APP)
class GitPilotSettings : PersistentStateComponent<GitPilotSettings.State> {

    data class State(
        var activeAccount: String = "",
        var commitMessageTemplate: String = "deploy: auto-deploy by GitPilot",
        var buildCommand: String = "",
        var buildBeforeDeploy: Boolean = false,
        var blockOnBuildFailure: Boolean = true,
        var releaseEnabled: Boolean = false
    )

    private var myState = State()
    override fun getState(): State = myState
    override fun loadState(state: State) { myState = state }

    // Convenient accessors
    var activeAccount: String get() = myState.activeAccount; set(v) { myState.activeAccount = v }
    var buildCommand: String get() = myState.buildCommand; set(v) { myState.buildCommand = v }
    var buildBeforeDeploy: Boolean get() = myState.buildBeforeDeploy; set(v) { myState.buildBeforeDeploy = v }
    var blockOnBuildFailure: Boolean get() = myState.blockOnBuildFailure; set(v) { myState.blockOnBuildFailure = v }
    var commitMessageTemplate: String get() = myState.commitMessageTemplate; set(v) { myState.commitMessageTemplate = v }

    companion object {
        val instance: GitPilotSettings
            get() = ApplicationManager.getApplication().getService(GitPilotSettings::class.java)

        fun saveToken(login: String, token: String) {
            PasswordSafe.instance.set(
                CredentialAttributes("gitpilot.token.$login"),
                Credentials(login, token)
            )
        }

        fun getToken(login: String): String? {
            return PasswordSafe.instance.get(CredentialAttributes("gitpilot.token.$login"))
                ?.getPasswordAsString()
        }

        fun getActiveToken(): String? {
            val login = instance.activeAccount
            return if (login.isEmpty()) null else getToken(login)
        }

        fun deleteToken(login: String) {
            PasswordSafe.instance.set(CredentialAttributes("gitpilot.token.$login"), null)
        }
    }
}
