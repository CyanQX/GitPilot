# GitPilot v2.0

> 🚀 Write code → Click Deploy → It's on GitHub. Never leave the IDE.

---

## 📖 User Guide (Step-by-Step Tutorial)

### 1. Installation

1. Press `Ctrl+Shift+P` → type `Extensions: Install from VSIX`
2. Select `gitpilot-1.x.x.vsix` → installation complete
3. A 🚀 icon appears in the left activity bar; click it to open the GitPilot panel

---

### 2. Sign in to GitHub

#### Method 1: PAT Token Login (Recommended)

| Step | Action |
|------|--------|
| ① | Open https://github.com/settings/tokens |
| ② | Click **Generate new token (classic)** |
| ③ | Check the `repo` + `workflow` scopes |
| ④ | Click generate → **copy the token** (`ghp_xxxx...`) |
| ⑤ | Back in VS Code, click **"Login with GitHub"** on the GitPilot panel |
| ⑥ | Choose "🔑 Personal Access Token" → paste the token → press Enter |

#### Method 2: Browser OAuth Login (I haven't tried this one myself — if it doesn't work, please report back!)

| Step | Action |
|------|--------|
| ① | Click **"Login with GitHub"** on the GitPilot panel |
| ② | Choose "🔐 Browser OAuth Login" |
| ③ | Select a browser (Edge / Chrome / Firefox...) |
| ④ | The browser opens the GitHub authorization page automatically → **click Authorize** |
| ⑤ | Once you see the "Authorization successful" page → login completes automatically |

> After a successful login, the sidebar shows your GitHub avatar and username ✅

---

### 3. Create a Repository & Link It

| Step | Action |
|------|--------|
| ① | Click **"+ Create Repository"** in the panel |
| ② | Enter a repository name (e.g. `my-project`) → press Enter |
| ③ | Choose "Public" or "Private" |
| ④ | Wait for the "✅ Created: CyanQX/my-project" message |
| ⑤ | Everything happens automatically: `git init` + `git remote add origin` + sidebar refresh |

> If you already have a GitHub repository and the deployment says "no remote repository linked", the notification includes a **"🔗 Link Repository"** button — click it and pick an existing repository.

---

### 4. Deploy

```
Write code → Click 🚀 Deploy → automatic commit + push → It's on GitHub
```

**Deployment flow (fully automatic):**

| Step | What GitPilot does |
|------|--------------------|
| ① Check changes | Scans all modified/added/deleted files |
| ② Smart filtering | Automatically excludes `node_modules/`, `.env`, secret files, build artifacts, etc. |
| ③ Stage files | `git add -A` stages all valid files |
| ④ Commit | `git commit -m "deploy: auto-deploy by GitPilot"` |
| ⑤ Push | `git push origin main` (branch auto-detected) |
| ⑥ Notify | Bottom-right popup: "🚀 Deployed! Staged 47 files" |

**One click, no manual git commands.**

---

### 5. Sync

```
Click 🔄 Sync → pull remote + push local → auto-synced
```

| Scenario | Description |
|----------|-------------|
| Remote has updates | `git pull` first to fetch the latest code |
| Local has changes | The full Deploy flow runs automatically |
| No changes | Skipped, no empty commits |

---

### 6. Switch Repository

| Step | Action |
|------|--------|
| ① | Click the **🔄 switch button** next to the repository name |
| ② | Your GitHub repository list pops up |
| ③ | Pick a repository → `origin` updates automatically → state refreshes |

---

### 7. Auto Deploy (optional)

Press `Ctrl+,` to open Settings → search for `gitpilot`:

| Setting | Description | Recommended |
|---------|-------------|-------------|
| `autoDeploy.onSave` | Deploy automatically after saving a file | `true` |
| `autoDeploy.onSaveDelay` | Delay in seconds after save (debounce) | `3` |
| `autoDeploy.scheduled` | Scheduled auto deploy | As needed |
| `autoDeploy.scheduledInterval` | Schedule interval | `30min` |

---

### 8. Build Command (optional)

If your project needs to be compiled before deployment:

| Step | Action |
|------|--------|
| ① | Click the **⚙️ gear** next to the build command |
| ② | Enter the build command (e.g. `npm run build`) |
| ③ | Choose "Run Build before deploy" → Yes |
| ④ | Choose "Block deploy when Build fails" → Yes |

---

### 9. Status Refresh

Click the **🔃 refresh button** next to the repository name:
- Fetches your GitHub repository list + local Git status
- Takes 3–7 seconds (depending on network speed)
- Timeout after 10 seconds → "Error! Please check your network connection"

---

### 10. FAQ

| Problem | Solution |
|---------|----------|
| "Remote repository not configured" | Click "🔗 Link Repository" in the notification → pick an existing repository |
| "src refspec main does not match" | You switched to a different default branch; click Sync to auto-fix |
| After login, switching tabs shows "not logged in" | Fixed in v1.1.1+, upgrade |
| Only README.md was uploaded | Fixed `git add -A` in v1.2.8+, upgrade |
| Clicking "View on GitHub" does nothing | Fixed in v1.2.6+, opens with Edge first |

---

## 🏗️ Architecture

```
GitPilot/
├── packages/
│   │
│   ├── core/                           # 🔷 Pure interface layer (zero platform dependencies)
│   │   ├── interfaces/                 #   8 abstract interfaces
│   │   ├── models/                     #   Pure data types
│   │   ├── deploy/                     #   Deploy orchestrator (depends on interfaces)
│   │   ├── security/                   #   Secret detection + Token management + Filtering
│   │   │   └── patterns.yml            #   ⭐ Rules externalized — update rules without touching code
│   │   └── utils/                      #   Logging
│   │
│   ├── provider-github/                # 🟢 GitHub Provider
│   │   ├── GitHubRepositoryProvider    #   → IRepositoryProvider
│   │   ├── GitHubAuthProvider          #   → IAuthProvider
│   │   └── GitHubReleaseProvider       #   → IReleaseProvider
│   │
│   ├── vscode-extension/               # 🔵 VS Code extension
│   │   ├── extension.ts                #   Wires Providers → Orchestrator
│   │   └── providers/                  #   Platform-specific implementations (simple-git, etc.)
│   │
│   └── jetbrains-plugin/               # 🟣 JetBrains plugin (Kotlin)
│       └── src/main/kotlin/com/gitpilot/
│           ├── core/                   #   Kotlin interfaces + Provider + Orchestrator
│           ├── ui/                     #   Tool window UI
│           └── actions/                #   Deploy / Sync / Login actions
│
├── docs/                               # Design documents
└── scripts/                            # Development scripts
```

---

## 🎯 Core Design Principles

### 1. Core depends on no platform

```
❌ Old: core/github/api.ts  ← Core directly contains the GitHub API
✅ New: core/interfaces/    ← Core only defines interfaces
        provider-github/    ← GitHub is an implementation
```

**Adding GitLab later: just add `provider-gitlab/`, zero changes to Core.**

### 2. Provider pattern — everything separated

| Interface | GitHub implementation | VS Code platform implementation | JetBrains platform implementation |
|-----------|-----------------------|--------------------------------|-----------------------------------|
| `IRepositoryProvider` | `GitHubRepositoryProvider` (Octokit) | - | `GitHubRepoProvider` (OkHttp) |
| `IAuthProvider` | `GitHubAuthProvider` (OAuth) | - | - |
| `IReleaseProvider` | `GitHubReleaseProvider` (Octokit) | - | - |
| `IGitProvider` | - | `VSCodeGitProvider` (simple-git) | `IntelliJGitProvider` (Git4Idea) |
| `IBuildProvider` | - | `VSCodeBuildProvider` | Inline implementation |
| `ISecretStorage` | - | `VSCodeSecretStorage` | `PasswordSafe` |
| `INotificationProvider` | - | `VSCodeNotificationProvider` | Inline implementation |

### 3. Build no longer guesses the language

```
❌ Old: 11 languages auto-detected → maintenance explosion
✅ New: the user writes the command → npm run build / cargo build / RunUAT BuildPlugin
```

### 4. Secret rules externalized

```
❌ Old: 30+ patterns hard-coded in TS
✅ New: packages/core/src/security/patterns.yml → update rules without code changes
```

---

## 🚀 Developer Quick Start

### VS Code extension

```bash
cd packages/vscode-extension
npm install
npm run compile
# F5 to start debugging
```

### JetBrains plugin

```bash
cd packages/jetbrains-plugin
./gradlew buildPlugin
```

---

## 📋 Extension Roadmap (based on the new architecture)

| New feature | Scope of change | Effort |
|-------------|-----------------|--------|
| **GitLab support** | Add `packages/provider-gitlab/` | ~200 lines |
| **Gitee support** | Add `packages/provider-gitee/` | ~150 lines |
| **Azure DevOps** | Add `packages/provider-azure/` | ~200 lines |
| **Cursor IDE** | Add `packages/cursor-extension/` | Reuses most VS Code code |
| **New secret rules** | Edit `patterns.yml` | 0 lines of code |

---

## 📊 Architecture Scorecard

| Dimension | Rating | Notes |
|-----------|--------|-------|
| Layered design | ⭐⭐⭐⭐⭐ | Core / Provider / Platform — three clear layers |
| Interface abstraction | ⭐⭐⭐⭐⭐ | 8 interfaces covering all extension points |
| Platform independence | ⭐⭐⭐⭐⭐ | Core has zero platform dependencies |
| Extensibility | ⭐⭐⭐⭐⭐ | New platform = new Provider, no Core changes |
| Maintainability | ⭐⭐⭐⭐⭐ | Externalized rules, Build doesn't guess |
