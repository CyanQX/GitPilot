# GitPilot — Cross-Platform Development Guide

> Two codebases (VS Code + IntelliJ IDEA), one architecture, fully aligned features.

---

## 📐 Unified Architecture

```
                    ┌──────────────────────────┐
                    │  Core interface layer    │
                    │  (pure logic, zero       │
                    │   platform dependencies) │
                    └────────────┬─────────────┘
           ┌─────────────────────┼─────────────────────┐
           ▼                     ▼                     ▼
    ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
    │ GitHub       │      │ VS Code      │      │ IntelliJ     │
    │ Provider     │      │ Platform     │      │ Platform     │
    │ (Octokit)    │      │ (simple-git) │      │ (Git4Idea)   │
    └──────────────┘      └──────────────┘      └──────────────┘
        TypeScript            TypeScript            Kotlin
```

**Core principle**: both platforms share the same interface definitions and implement them with each platform's native capabilities.

---

## 📊 Feature Comparison

> ✅ = implemented  ⚠️ = partial  ❌ = not implemented

| Feature area | VS Code (TS) | IntelliJ (Kotlin) | Notes |
|--------------|--------------|-------------------|-------|
| **Login** | | | |
| PAT token login | ✅ v1.0 | ✅ v1.2.9 | Encrypted storage via PasswordSafe |
| Browser OAuth | ✅ v1.1 | ❌ | Requires registering an OAuth App first |
| Multi-account switching | ✅ v1.0 | ❌ | |
| **Repository management** | | | |
| Create repository | ✅ v1.0 | ✅ v1.2.9 | Runs git remote add automatically after creation |
| Switch repository | ✅ v1.2.7 | ✅ v1.2.9 | Updates origin + refreshes state |
| List repositories | ✅ v1.0 | ✅ v1.0 | GitHub API |
| One-click repo linking | ✅ v1.2.3 | ❌ | Notification button |
| **Deployment flow** | | | |
| Check changes | ✅ | ✅ | git status |
| Smart file filtering | ✅ | ✅ v1.2.9 | .gitignore + secret detection |
| Build command | ✅ | ✅ v1.2.9 | Executed via ProcessBuilder |
| git add -A | ✅ v1.2.8 | ✅ v1.2.9 | Full staging |
| git commit | ✅ | ✅ | Automatic commit message |
| git push | ✅ | ✅ | Includes origin/branch validation |
| Unpushed-commit detection | ✅ v1.2.9 | ✅ v1.2.9 | Ahead-count check |
| Release publishing | ✅ v1.0 | ✅ v1.2.9 | GitHub Releases API |
| **Sync flow** | | | |
| git pull | ✅ | ✅ | |
| pull + deploy | ✅ | ✅ | Sync = pull + deploy |
| **UI** | | | |
| Sidebar / tool window | ✅ Webview | ✅ Swing Panel | |
| Account avatar display | ✅ v1.2.1 | ❌ | |
| Refresh button + animation | ✅ v1.2.1 | ❌ | |
| Deploy progress bar | ✅ | ✅ | ProgressIndicator |
| Success/failure notifications | ✅ v1.2.6 | ✅ | Messages.show* |
| **Configuration** | | | |
| Auto deploy (on save) | ✅ | ❌ | FileWatcher |
| Scheduled deploy | ✅ | ❌ | ScheduledExecutor |
| Build command config | ✅ | ✅ | |
| **Security** | | | |
| Encrypted token storage | ✅ SecretStorage | ✅ PasswordSafe | |
| Secret file exclusion | ✅ SmartFilter | ✅ SmartFilter | |
| .gitignore compatibility | ✅ | ✅ | |

---

## 🔧 Platform Comparison: Key Implementation Differences

### Git operations

| | VS Code | IntelliJ |
|----|---------|----------|
| **Git library** | `simple-git` (Node.js) | `Git4Idea` (built-in) |
| **git add** | `this.git.add('.')` | `GitLineHandler(ADD)` + `addParameters("-A")` |
| **git push** | `this.git.push(remote, target)` | `GitLineHandler(PUSH)` + `addParameters(remote, targetBranch)` |
| **Get status** | `simpleGit.status()` | `GitUtil.getStatus(project, root)` |
| **Remote check** | `this.git.getRemotes(true)` | `repo.remotes.any { it.name == remote }` |

### Secure storage

| | VS Code | IntelliJ |
|----|---------|----------|
| **API** | `vscode.SecretStorage` | `com.intellij.credentialStore.PasswordSafe` |
| **Storage call** | `context.secrets.store(key, value)` | `PasswordSafe.instance.set(attributes, Credentials(login, token))` |

### HTTP requests

| | VS Code | IntelliJ |
|----|---------|----------|
| **Library** | `@octokit/rest` (GitHub SDK) | `okhttp3` (generic HTTP) |
| **Pros** | Type-safe, automatic pagination | Lightweight, controllable |
| **Cons** | Requires an npm package | JSON parsed manually |

### UI framework

| | VS Code | IntelliJ |
|----|---------|----------|
| **Tech** | HTML + CSS + JS (Webview) | Swing (Java UI) |
| **Pros** | Flexible, hot-reloadable | Native performance |
| **Cons** | CSP restrictions, harder debugging | More code to write |

---

## 🚀 Developer Guide: Adding a Feature on Both Platforms

Example: adding GitLab support

### Step 1: Define the interface (Core)

```typescript
// packages/core/src/interfaces/IRepositoryProvider.ts
// Already exists, no changes needed
export interface IRepositoryProvider {
    readonly platform: string;
    listRepos(): Promise<Repository[]>;
    createRepo(options: CreateRepoOptions): Promise<Repository>;
    // ...
}
```

### Step 2: Implement the GitLab Provider (VS Code)

```bash
# Create the directory
mkdir packages/provider-gitlab/src
```

```typescript
// packages/provider-gitlab/src/GitLabRepositoryProvider.ts
export class GitLabRepositoryProvider implements IRepositoryProvider {
    readonly platform = 'gitlab';
    // Implement all interface methods...
}
```

### Step 3: Implement the GitLab Provider (IntelliJ / Kotlin)

```kotlin
// packages/jetbrains-plugin/src/main/kotlin/com/gitpilot/core/GitLabRepoProvider.kt
class GitLabRepoProvider(private var token: String) : IRepoProvider {
    override val platform = "gitlab"
    // Implement all interface methods...
}
```

### Step 4: Register on each platform

- **VS Code**: inject `new GitLabRepositoryProvider(...)` into `DeployOrchestrator` in `extension.ts`
- **IntelliJ**: register the Service in `plugin.xml`, instantiate it in the Actions

---

## 📁 File Correspondence

| VS Code (TS) | IntelliJ (Kotlin) | Purpose |
|--------------|-------------------|---------|
| `extension.ts` | `Actions.kt` | Command entry |
| `deploy-orchestrator.ts` | `DeployOrchestrator.kt` | Deploy orchestration |
| `vscode-git-provider.ts` | `IntelliJGitProvider.kt` | Git operations |
| `vscode-build-provider.ts` | `BuildProvider.kt` | Build execution |
| `smart-filter.ts` | `SmartFilter.kt` | File filtering |
| `GitHubAuthProvider.ts` | `LoginAction` (in Actions.kt) | Login |
| `GitHubRepositoryProvider.ts` | `GitHubRepoProvider.kt` | Repository management |
| `GitHubReleaseProvider.ts` | `GitHubReleaseProvider.kt` | Release |
| `sidebar-provider.ts` | `GitPilotToolWindow.kt` | UI panel |
| `vscode-secret-storage.ts` | `GitPilotSettings.kt` | Secure storage |
| `browser-auth-handler.ts` | ❌ Not implemented | Browser OAuth |
| `vscode-file-watcher-provider.ts` | ❌ Not implemented | File watching |
| `vscode-notification-provider.ts` | `Messages.show*` | Notifications |

---

## ⚠️ Current JetBrains Plugin Limitations

| Limitation | Reason | Solution |
|------------|--------|----------|
| Not yet compile-verified | Gradle dependencies must be resolved in IntelliJ | Compile with `gradle buildPlugin` |
| Browser OAuth not implemented | Needs an OAuth App registration + local HTTP server | To be added |
| File-watcher auto-deploy not implemented | Requires porting `FileWatcherProvider` | To be added |
| Basic UI | Hand-coded Swing layout | Can switch to IntelliJ's `DialogWrapper` / `JBList` |
| No notification messages | Uses blocking `Messages.show*` dialogs | Switch to `NotificationGroupManager` |
| GitHub API token may expire | PATs expire | Add token expiry detection later |

---

## 🔨 Building the JetBrains Plugin

```bash
cd packages/jetbrains-plugin
gradle buildPlugin
# Output: build/distributions/gitpilot-1.0.0.zip
```

Install: IntelliJ → Settings → Plugins → ⚙️ → Install Plugin from Disk → select the `.zip`

---

## 📦 Current Versions

| Platform | Version | Status |
|----------|---------|--------|
| VS Code | v1.2.9 | ✅ `.vsix` published |
| IntelliJ IDEA | v1.2.9 | ✅ Code complete, pending compile verification |
