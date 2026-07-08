# GitPilot — 已知问题修复记录

> 从最初版本到最新版，逐版迭代。从下往上看，能看到一个插件是怎么从「能用」到「好用」的完整过程。

---

## 🆕 v1.2.9（最新）

### 已 commit 但未 push 的文件不会被自动推送

| 项 | 内容 |
|----|------|
| **现象** | 文件已经 `git commit` 了，但点 Deploy 提示「没有需要部署的变更」，不执行 `git push`。导致文件只留在本地，GitHub 上看不到 |
| **根因** | Deploy 流程第一步只检查 `hasChanges()`（未提交的文件变更），不检查 `ahead`（已提交但未推送的提交数）。`ahead > 0` 时直接跳过了 |
| **修复** | Deploy 第一步增加 `ahead` 检测：如有未推送提交 → 跳过暂存/提交，直接执行 `git push` |

---

## v1.2.8

### `git add .` 可能漏文件 → 升级为 `git add -A`

| 项 | 内容 |
|----|------|
| **承接** | v1.2.7 改了暂存顺序，但 `git add .` 只加当前目录，删除操作不会被暂存 |
| **修复** | 改用 `git add -A`（全量：新增+修改+删除）。新增 `getStagedFiles()` 用 `git diff --cached` 验证实际暂存数。部署成功通知显示「已暂存 N 个文件」 |

---

## v1.2.7

### 只上传了 README.md，整个项目文件没上去 🔥

| 项 | 内容 |
|----|------|
| **现象** | 点 Sync/Deploy 后，GitHub 仓库里只有一个 `README.md`，其他所有项目文件全部缺失 |
| **根因** | `stageFiles()` 逻辑是：先 `git reset` 排除文件 → 再 `git add .` 全部加回来。**顺序反了**，排除等于没做。同时全新仓库（无 HEAD）时 `git reset` 静默失败 |
| **修复** | 改为先 `git add -A` → 再 `git reset --` / `git rm --cached` 排除密钥和构建产物 |

### 切换仓库后侧边栏不更新

| 项 | 内容 |
|----|------|
| **现象** | 在「当前仓库」点击切换，选了新仓库后侧边栏仓库名不变 |
| **根因** | `handleSwitchRepo` 只弹消息，不更新 `origin` 也不刷新 UI |
| **修复** | 切换后自动：更新 `git remote` → 重建 `orchestrator` → 刷新侧边栏 → 触发状态刷新 |

---

## v1.2.6

### 点击「在 GitHub 上查看」按钮没反应

| 项 | 内容 |
|----|------|
| **现象** | 部署成功通知里有按钮，点下去什么都不发生 |
| **根因** | `showDeployResult()` 成功分支没有 `await`，按钮点击返回值被丢弃 |
| **修复** | 成功分支也 `await` → 检测 `open-repo` → 用 Edge/Chrome 打开仓库 URL。浏览器优先级：Edge → Chrome → 都没有则弹提示 |

---

## v1.2.5

### 侧边栏 UI 改用浅蓝配色

> 原来的暗黑背景替换为浅蓝（`#e8f4fd`），卡片白色底，整体更清爽。

---

## v1.2.4

### VS Code 自带的 GitHub 登录弹窗抢跑

| 项 | 内容 |
|----|------|
| **现象** | 还没操作 GitPilot，VS Code 突然弹出一个「Connect to GitHub」登录框 |
| **根因** | 扩展激活时 `new Octokit()` 空认证创建了 GitHub API 实例，VS Code 检测到未认证请求后自动拦截弹出自己的登录框 |
| **修复** | 启动时不创建 Octokit，等用户真正登录后才 `new Octokit({ auth: token })`。所有 API 调用前加 `ensureLoggedIn()` 守卫 |

---

## v1.2.3

### 部署失败后无法快速修复 → 一键关联仓库

| 项 | 内容 |
|----|------|
| **新增** | 部署失败通知里增加「🔗 关联仓库」按钮，点击直接列出你的 GitHub 仓库列表，选一个自动 `git remote add origin` |

---

## v1.2.2

### 创建仓库后没关联本地 git remote 🔥

| 项 | 内容 |
|----|------|
| **现象** | 点了「创建仓库」，GitHub 上建好了，但本地推送报 `'origin' does not appear to be a git repository` |
| **根因** | `handleCreateRepo` 只在 GitHub 侧创建，没执行本地 `git init` + `git remote add` |
| **修复** | 创建仓库后自动：`git init`（如果还不是仓库）→ `git remote add origin <cloneUrl>`。推送前也会检查 origin 是否存在 |

---

## v1.2.1

### 刷新按钮只列数量，不拉数据

| 项 | 内容 |
|----|------|
| **原始** | 点刷新 → 「找到 N 个仓库」，完全不调用 GitHub API |
| **修复** | 真实拉取 GitHub 仓库列表 + 检查本地 Git 状态。3~7 秒随机延迟（模拟网络），超时 10 秒提示「报错！请检查网络是否正常」。按钮旋转动画 |

### GitHub 头像不显示

| 项 | 内容 |
|----|------|
| **现象** | 登录后只显示 🐱 猫图标，没有真实头像 |
| **根因** | VS Code webview 默认 CSP 阻止 `https://avatars.githubusercontent.com` 外部图片 |
| **修复** | HTML `<head>` 添加 `<meta>` 标签放开 `img-src https: data:`。加载失败自动回退 🐱 |

---

## v1.2.0

### 部署失败：`src refspec main does not match any` 🔥

| 项 | 内容 |
|----|------|
| **现象** | 点 Deploy 报错推不上去，Git 提示分支不存在 |
| **根因** | 硬编码推送 `main` 分支，但仓库默认分支可能是 `master`，或新仓库尚未创建任何分支 |
| **修复** | `push()` 内先验证分支是否存在 → 不存在则回退 `getCurrentBranch()` → 都不行则清晰的中文提示 |

### 侧边栏 UI 全面重做

> 从简陋的按钮堆砌 → 现代卡片式布局：账号头像卡片 + 仓库选择 + 操作按钮 + 构建命令 + 状态栏。

---

## v1.1.1

### 登录后切标签页，回来变"未登录" 🔥

| 项 | 内容 |
|----|------|
| **现象** | 明明已登录，切到文件浏览器再切回来，侧边栏变回「未登录」，Deploy 按钮消失 |
| **根因** | VS Code 切换标签页时**销毁 webview**，回来重建 HTML 永远是初始状态 |
| **修复** | ① `retainContextWhenHidden: true` 保留 webview ② `SidebarProvider` 内部记忆登录状态（`_isLoggedIn` 等字段）③ webview 加载时发 `getState` 请求主动恢复 |

---

## v1.1.0

### 登录只有 PAT 输入框，没有浏览器登录

| 项 | 内容 |
|----|------|
| **原始** | 点击登录 → 弹出通知「正在打开登录...」→ PAT 输入框。不跳浏览器 |
| **新增** | ① QuickPick 选登录方式（浏览器 OAuth / PAT Token）② 浏览器选择面板（检测已安装的 Chrome/Edge/Firefox/Brave/Opera）③ 本地 HTTP 服务器接收 OAuth 回调 ④ 自动打开浏览器完成授权 |

---

## 📐 v1.0.0（起点）

> 初始版本：PAT Token 手动输入登录 → 创建仓库 → Deploy/Sync 基础流程。问题：只完成了骨架，每个环节都有坑。

---

## 📊 迭代时间线

```
v1.0.0 ──→ v1.1.0 ──→ v1.1.1 ──→ v1.2.0 ──→ v1.2.1 ──→ v1.2.2
 骨架      浏览器登录   状态持久化   UI重做      真实刷新     自动关联
                                     分支修复    头像显示     remote

v1.2.3 ──→ v1.2.4 ──→ v1.2.5 ──→ v1.2.6 ──→ v1.2.7 ──→ v1.2.8 ──→ v1.2.9
 一键关联   阻止弹窗    浅蓝配色    打开浏览器   修复上传     全量暂存     未推送提交
 仓库       冲突                               切换刷新     文件数日志    自动push
```

---

## 🔧 当前已知限制

| 限制 | 影响 | 计划 |
|------|------|------|
| OAUTH_CLIENT_ID 是占位符 | 浏览器 OAuth 实际走 PAT 流程 | 注册 GitHub OAuth App |
| 不支持 GitLab / Gitee | 只能部署到 GitHub | 架构已预留 Provider 接口 |
| Webview CSP 限制 | 部分本地资源加载失败 | 后续改为 `webview.asWebviewUri()` |
