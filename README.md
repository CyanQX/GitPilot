# GitPilot v2.0

> 🚀 写代码 → 点部署 → GitHub 上就有了。全程不离开 IDE。

---

## 📖 使用指南（手把手教学）

### 一、安装

1. 按 `Ctrl+Shift+P` → 输入 `Extensions: Install from VSIX`
2. 选择 `gitpilot-1.x.x.vsix` → 安装完成
3. 左侧活动栏出现 🚀 图标，点击打开 GitPilot 面板

---

### 二、登录 GitHub

#### 方式 1：PAT Token 登录（推荐）

| 步骤 | 操作 |
|------|------|
| ① | 打开 https://github.com/settings/tokens |
| ② | 点击 **Generate new token (classic)** |
| ③ | 勾选 `repo` + `workflow` 权限 |
| ④ | 点击生成 → **复制 Token**（`ghp_xxxx...`） |
| ⑤ | 回到 VS Code，点 GitPilot 面板的 **「Login with GitHub」** |
| ⑥ | 选择「🔑 Personal Access Token」→ 粘贴 Token → 回车 |

#### 方式 2：浏览器 OAuth 登录（本人没试过这个，不行的话再反馈给我！）

| 步骤 | 操作 |
|------|------|
| ① | 点 GitPilot 面板的 **「Login with GitHub」** |
| ② | 选择「🔐 浏览器 OAuth 登录」 |
| ③ | 选择浏览器（Edge / Chrome / Firefox...） |
| ④ | 浏览器自动打开 GitHub 授权页面 → **点授权** |
| ⑤ | 看到「授权成功」页面 → 自动完成登录 |

> 登录成功后，侧边栏显示你的 GitHub 头像和用户名 ✅

---

### 三、创建仓库 & 关联

| 步骤 | 操作 |
|------|------|
| ① | 点击面板中的 **「+ 创建仓库」** |
| ② | 输入仓库名（如 `my-project`）→ 回车 |
| ③ | 选择「公开」或「私有」 |
| ④ | 等待提示「✅ 已创建: CyanQX/my-project」 |
| ⑤ | 自动完成：`git init` + `git remote add origin` + 侧边栏刷新 |

> 如果你已有 GitHub 仓库，部署时如果提示「未关联远程仓库」，通知里会有 **「🔗 关联仓库」** 按钮，点击选择已有仓库即可。

---

### 四、部署（Deploy）

```
写代码 → 点 🚀 Deploy → 自动 commit + push → GitHub 上就有了
```

**部署流程（全自动）：**

| 步骤 | GitPilot 在做什么 |
|------|------------------|
| ① 检查变更 | 扫描所有修改/新增/删除的文件 |
| ② 智能过滤 | 自动排除 `node_modules/`、`.env`、密钥文件、构建产物等 |
| ③ 暂存文件 | `git add -A` 暂存全部有效文件 |
| ④ 提交 | `git commit -m "deploy: auto-deploy by GitPilot"` |
| ⑤ 推送 | `git push origin main`（自动检测分支） |
| ⑥ 通知 | 右下角弹出「🚀 部署成功！已暂存 47 个文件」 |

**一键完成，无需手动 git 操作。**

---

### 五、同步（Sync）

```
点 🔄 Sync → pull 远端 + push 本地 → 自动同步
```

| 场景 | 说明 |
|------|------|
| 远端有更新 | 先 `git pull` 拉取最新代码 |
| 本地有变更 | 自动执行完整 Deploy 流程 |
| 无变更 | 跳过，不产生空提交 |

---

### 六、切换仓库

| 步骤 | 操作 |
|------|------|
| ① | 点击仓库名旁的 **🔄 切换按钮** |
| ② | 弹出你的 GitHub 仓库列表 |
| ③ | 选择一个仓库 → 自动更新 `origin` → 刷新状态 |

---

### 七、自动部署（可选配置）

按 `Ctrl+,` 打开设置 → 搜索 `gitpilot`：

| 配置项 | 说明 | 推荐值 |
|--------|------|--------|
| `autoDeploy.onSave` | 保存文件后自动部署 | `true` |
| `autoDeploy.onSaveDelay` | 保存后延迟秒数（防抖） | `3` |
| `autoDeploy.scheduled` | 定时自动部署 | 按需 |
| `autoDeploy.scheduledInterval` | 定时间隔 | `30min` |

---

### 八、构建命令（可选）

如果你的项目需要先编译再部署：

| 步骤 | 操作 |
|------|------|
| ① | 点构建命令旁的 **⚙️ 齿轮** |
| ② | 输入构建命令（如 `npm run build`） |
| ③ | 选择「部署前执行 Build」→ 是 |
| ④ | 选择「Build 失败时阻止部署」→ 是 |

---

### 九、状态刷新

点击仓库名旁的 **🔃 刷新按钮**：
- 自动拉取 GitHub 仓库列表 + Git 本地状态
- 3~7 秒完成（根据网络速度）
- 超时 10 秒 → 提示「报错！请检查网络是否正常」

---

### 十、常见问题

| 问题 | 解决方法 |
|------|---------|
| 「远程仓库未配置」 | 点击通知里的「🔗 关联仓库」→ 选择已有仓库 |
| 「src refspec main does not match」 | 切换到了不同的默认分支，点击 Sync 自动修复 |
| 登录后切换标签页回来显示未登录 | v1.1.1+ 已修复，升级版本 |
| 只上传了 README.md | v1.2.8+ 已修复 `git add -A`，升级版本 |
| 点了「在 GitHub 上查看」没反应 | v1.2.6+ 已修复，优先用 Edge 打开 |

---

## 🏗️ 架构设计

```
GitPilot/
├── packages/
│   │
│   ├── core/                           # 🔷 纯接口层（零平台依赖）
│   │   ├── interfaces/                 #   8 个抽象接口
│   │   ├── models/                     #   纯数据类型
│   │   ├── deploy/                     #   部署编排器（依赖接口）
│   │   ├── security/                   #   密钥检测 + Token 管理 + 过滤
│   │   │   └── patterns.yml            #   ⭐ 规则外部化，更新不改代码
│   │   └── utils/                      #   日志
│   │
│   ├── provider-github/                # 🟢 GitHub Provider
│   │   ├── GitHubRepositoryProvider    #   → IRepositoryProvider
│   │   ├── GitHubAuthProvider          #   → IAuthProvider
│   │   └── GitHubReleaseProvider       #   → IReleaseProvider
│   │
│   ├── vscode-extension/               # 🔵 VS Code 扩展
│   │   ├── extension.ts                #   组装 Provider → Orchestrator
│   │   └── providers/                  #   平台特定实现 (simple-git 等)
│   │
│   └── jetbrains-plugin/               # 🟣 JetBrains 插件 (Kotlin)
│       └── src/main/kotlin/com/gitpilot/
│           ├── core/                   #   Kotlin 版接口 + Provider + Orchestrator
│           ├── ui/                     #   工具窗口 UI
│           └── actions/                #   Deploy / Sync / Login 动作
│
├── docs/                               # 设计文档
└── scripts/                            # 开发脚本
```

---

## 🎯 核心设计原则

### 1. Core 不依赖任何平台

```
❌ 旧架构：core/github/api.ts  ← Core 直接包含 GitHub API
✅ 新架构：core/interfaces/    ← Core 只定义接口
           provider-github/    ← GitHub 是实现
```

**以后加 GitLab：只需新增 `provider-gitlab/`，Core 一行不改。**

### 2. Provider 模式 — 全部分离

| 接口 | GitHub 实现 | VS Code 平台实现 | JetBrains 平台实现 |
|------|------------|-----------------|-------------------|
| `IRepositoryProvider` | `GitHubRepositoryProvider` (Octokit) | - | `GitHubRepoProvider` (OkHttp) |
| `IAuthProvider` | `GitHubAuthProvider` (OAuth) | - | - |
| `IReleaseProvider` | `GitHubReleaseProvider` (Octokit) | - | - |
| `IGitProvider` | - | `VSCodeGitProvider` (simple-git) | `IntelliJGitProvider` (Git4Idea) |
| `IBuildProvider` | - | `VSCodeBuildProvider` | 内联实现 |
| `ISecretStorage` | - | `VSCodeSecretStorage` | `PasswordSafe` |
| `INotificationProvider` | - | `VSCodeNotificationProvider` | 内联实现 |

### 3. Build 不再猜测语言

```
❌ 旧：11 种语言自动检测 → 维护爆炸
✅ 新：用户自己写命令 → npm run build / cargo build / RunUAT BuildPlugin
```

### 4. 密钥规则外部化

```
❌ 旧：30+ 种模式硬编码在 TS 中
✅ 新：packages/core/src/security/patterns.yml → 更新规则不改代码
```

---

## 🚀 开发者快速开始

### VS Code 扩展

```bash
cd packages/vscode-extension
npm install
npm run compile
# F5 启动调试
```

### JetBrains 插件

```bash
cd packages/jetbrains-plugin
./gradlew buildPlugin
```

---

## 📋 扩展路线（基于新架构）

| 新增内容 | 改动范围 | 改动量 |
|----------|---------|--------|
| **GitLab 支持** | 新增 `packages/provider-gitlab/` | ~200 行 |
| **Gitee 支持** | 新增 `packages/provider-gitee/` | ~150 行 |
| **Azure DevOps** | 新增 `packages/provider-azure/` | ~200 行 |
| **Cursor IDE** | 新增 `packages/cursor-extension/` | 复用 VS Code 大部分代码 |
| **新的密钥规则** | 编辑 `patterns.yml` | 0 行代码 |

---

## 📊 架构评分

| 维度 | 评分 | 说明 |
|------|------|------|
| 分层设计 | ⭐⭐⭐⭐⭐ | Core / Provider / Platform 三层清晰 |
| 接口抽象 | ⭐⭐⭐⭐⭐ | 8 个接口覆盖所有扩展点 |
| 平台独立性 | ⭐⭐⭐⭐⭐ | Core 零平台依赖 |
| 可扩展性 | ⭐⭐⭐⭐⭐ | 新平台 = 新 Provider，不改 Core |
| 可维护性 | ⭐⭐⭐⭐⭐ | 规则外部化、Build 不猜测 |
