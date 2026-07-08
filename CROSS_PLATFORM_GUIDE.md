# GitPilot — 双平台兼容开发指南

> VS Code + IntelliJ IDEA 两套代码，一套架构，功能完全对齐。

---

## 📐 统一架构

```
                    ┌─────────────────────┐
                    │   Core 接口层        │
                    │   (纯逻辑，零平台依赖) │
                    └──────┬──────────────┘
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │ GitHub       │ │ VS Code      │ │ IntelliJ     │
    │ Provider     │ │ Platform     │ │ Platform     │
    │ (Octokit)    │ │ (simple-git) │ │ (Git4Idea)   │
    └──────────────┘ └──────────────┘ └──────────────┘
         TypeScript       TypeScript        Kotlin
```

**核心原则**：两平台共享同一套接口定义，各自用平台原生能力实现。

---

## 📊 功能对照表

> ✅ = 已实现  ⚠️ = 部分实现  ❌ = 未实现

| 功能模块 | VS Code (TS) | IntelliJ (Kotlin) | 说明 |
|----------|-------------|-------------------|------|
| **登录** | | | |
| PAT Token 登录 | ✅ v1.0 | ✅ v1.2.9 | PasswordSafe 加密存储 |
| 浏览器 OAuth | ✅ v1.1 | ❌ | 需注册 OAuth App 后才可用 |
| 多账号切换 | ✅ v1.0 | ❌ | |
| **仓库管理** | | | |
| 创建仓库 | ✅ v1.0 | ✅ v1.2.9 | 创建后自动 git remote add |
| 切换仓库 | ✅ v1.2.7 | ✅ v1.2.9 | 更新 origin + 刷新状态 |
| 列出仓库 | ✅ v1.0 | ✅ v1.0 | GitHub API |
| 一键关联仓库 | ✅ v1.2.3 | ❌ | 通知栏按钮 |
| **部署流程** | | | |
| 检查变更 | ✅ | ✅ | git status |
| 智能文件过滤 | ✅ | ✅ v1.2.9 | .gitignore + 密钥检测 |
| 构建命令 | ✅ | ✅ v1.2.9 | ProcessBuilder 执行 |
| git add -A | ✅ v1.2.8 | ✅ v1.2.9 | 全量暂存 |
| git commit | ✅ | ✅ | 自动提交消息 |
| git push | ✅ | ✅ | 含 origin/branch 验证 |
| 未推送提交检测 | ✅ v1.2.9 | ✅ v1.2.9 | ahead 计数检测 |
| Release 发布 | ✅ v1.0 | ✅ v1.2.9 | GitHub Releases API |
| **同步流程** | | | |
| git pull | ✅ | ✅ | |
| pull + deploy | ✅ | ✅ | Sync = pull + deploy |
| **UI** | | | |
| 侧边栏/工具窗口 | ✅ Webview | ✅ Swing Panel | |
| 账号头像显示 | ✅ v1.2.1 | ❌ | |
| 刷新按钮+动画 | ✅ v1.2.1 | ❌ | |
| 部署进度条 | ✅ | ✅ | ProgressIndicator |
| 成功/失败通知 | ✅ v1.2.6 | ✅ | Messages.show* |
| **配置** | | | |
| 自动部署(保存触发) | ✅ | ❌ | FileWatcher |
| 定时部署 | ✅ | ❌ | ScheduledExecutor |
| 构建命令配置 | ✅ | ✅ | |
| **安全** | | | |
| Token 加密存储 | ✅ SecretStorage | ✅ PasswordSafe | |
| 密钥文件排除 | ✅ SmartFilter | ✅ SmartFilter | |
| .gitignore 兼容 | ✅ | ✅ | |

---

## 🔧 平台对照：关键实现差异

### Git 操作

| | VS Code | IntelliJ |
|----|---------|----------|
| **Git 库** | `simple-git` (Node.js) | `Git4Idea` (内置) |
| **git add** | `this.git.add('.')` | `GitLineHandler(ADD)` + `addParameters("-A")` |
| **git push** | `this.git.push(remote, target)` | `GitLineHandler(PUSH)` + `addParameters(remote, targetBranch)` |
| **获取状态** | `simpleGit.status()` | `GitUtil.getStatus(project, root)` |
| **remote 检查** | `this.git.getRemotes(true)` | `repo.remotes.any { it.name == remote }` |

### 安全存储

| | VS Code | IntelliJ |
|----|---------|----------|
| **API** | `vscode.SecretStorage` | `com.intellij.credentialStore.PasswordSafe` |
| **存储方式** | `context.secrets.store(key, value)` | `PasswordSafe.instance.set(attributes, Credentials(login, token))` |

### HTTP 请求

| | VS Code | IntelliJ |
|----|---------|----------|
| **库** | `@octokit/rest` (GitHub SDK) | `okhttp3` (通用 HTTP) |
| **优势** | 类型安全、自动分页 | 轻量、可控 |
| **劣势** | 需安装 npm 包 | 需手动解析 JSON |

### UI 框架

| | VS Code | IntelliJ |
|----|---------|----------|
| **技术** | HTML + CSS + JS (Webview) | Swing (Java UI) |
| **优势** | 灵活、可热更新 | 原生性能 |
| **劣势** | CSP 限制、调试困难 | 代码量较大 |

---

## 🚀 开发指南：新增功能双平台实现步骤

以「添加 GitLab 支持」为例：

### Step 1：定义接口（Core）

```typescript
// packages/core/src/interfaces/IRepositoryProvider.ts
// 已有，无需修改
export interface IRepositoryProvider {
    readonly platform: string;
    listRepos(): Promise<Repository[]>;
    createRepo(options: CreateRepoOptions): Promise<Repository>;
    // ...
}
```

### Step 2：实现 GitLab Provider（VS Code）

```bash
# 新建目录
mkdir packages/provider-gitlab/src
```

```typescript
// packages/provider-gitlab/src/GitLabRepositoryProvider.ts
export class GitLabRepositoryProvider implements IRepositoryProvider {
    readonly platform = 'gitlab';
    // 实现所有接口方法...
}
```

### Step 3：实现 GitLab Provider（IntelliJ / Kotlin）

```kotlin
// packages/jetbrains-plugin/src/main/kotlin/com/gitpilot/core/GitLabRepoProvider.kt
class GitLabRepoProvider(private var token: String) : IRepoProvider {
    override val platform = "gitlab"
    // 实现所有接口方法...
}
```

### Step 4：注册到平台

- **VS Code**: `extension.ts` 中 `new GitLabRepositoryProvider(...)` 注入到 `DeployOrchestrator`
- **IntelliJ**: `plugin.xml` 注册 Service，Actions 中创建实例

---

## 📁 文件对应关系

| VS Code (TS) | IntelliJ (Kotlin) | 功能 |
|-------------|-------------------|------|
| `extension.ts` | `Actions.kt` | 命令入口 |
| `deploy-orchestrator.ts` | `DeployOrchestrator.kt` | 部署编排 |
| `vscode-git-provider.ts` | `IntelliJGitProvider.kt` | Git 操作 |
| `vscode-build-provider.ts` | `BuildProvider.kt` | 构建执行 |
| `smart-filter.ts` | `SmartFilter.kt` | 文件过滤 |
| `GitHubAuthProvider.ts` | `LoginAction` (in Actions.kt) | 登录 |
| `GitHubRepositoryProvider.ts` | `GitHubRepoProvider.kt` | 仓库管理 |
| `GitHubReleaseProvider.ts` | `GitHubReleaseProvider.kt` | Release |
| `sidebar-provider.ts` | `GitPilotToolWindow.kt` | UI 面板 |
| `vscode-secret-storage.ts` | `GitPilotSettings.kt` | 安全存储 |
| `browser-auth-handler.ts` | ❌ 未实现 | 浏览器 OAuth |
| `vscode-file-watcher-provider.ts` | ❌ 未实现 | 文件监听 |
| `vscode-notification-provider.ts` | `Messages.show*` | 通知 |

---

## ⚠️ 当前 JetBrains 版局限性

| 限制 | 原因 | 解决方案 |
|------|------|---------|
| 未编译验证 | Gradle 依赖需在 IntelliJ 中解析 | 用 `gradle buildPlugin` 编译 |
| 浏览器 OAuth 未实现 | 需要 OAuth App 注册 + 本地 HTTP Server | 后续补全 |
| 文件监听自动部署未实现 | 需移植 `FileWatcherProvider` | 后续补全 |
| UI 较简陋 | Swing 手动布局 | 可改用 IntelliJ 的 `DialogWrapper` / `JBList` |
| 无通知栏消息 | 用了 `Messages.show*` 阻塞弹窗 | 改用 `NotificationGroupManager` |
| GitHub API Token 可能过期 | PAT 有过期时间 | 后续加 Token 过期检测 |

---

## 🔨 编译 JetBrains 插件

```bash
cd packages/jetbrains-plugin
gradle buildPlugin
# 输出: build/distributions/gitpilot-1.0.0.zip
```

安装：IntelliJ → Settings → Plugins → ⚙️ → Install Plugin from Disk → 选 `.zip`

---

## 📦 当前版本

| 平台 | 版本 | 状态 |
|------|------|------|
| VS Code | v1.2.9 | ✅ 已发布 `.vsix` |
| IntelliJ IDEA | v1.2.9 | ✅ 代码已补全，待编译验证 |
