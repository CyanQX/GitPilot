# GitPilot — Known Issues & Fix Log

> Iterating version by version, from the first release to the latest. Reading from the bottom up, you can see the complete journey of a plugin going from "works" to "works great".

---

## 🆕 v1.2.9 (Latest)

### Committed but unpushed files were not pushed automatically

| Item | Details |
|------|---------|
| **Symptom** | Files were already `git commit`ed, but clicking Deploy said "no changes to deploy" and `git push` was not executed. The files stayed local and were invisible on GitHub |
| **Root cause** | The first step of Deploy only checked `hasChanges()` (uncommitted file changes) but not `ahead` (the number of committed-but-unpushed commits). When `ahead > 0` it was skipped entirely |
| **Fix** | Added an `ahead` check to the first Deploy step: if there are unpushed commits → skip staging/committing and run `git push` directly |

---

## v1.2.8

### `git add .` could miss files → upgraded to `git add -A`

| Item | Details |
|------|---------|
| **Follow-up** | v1.2.7 fixed the staging order, but `git add .` only adds the current directory; deletions were not staged |
| **Fix** | Switched to `git add -A` (full: added + modified + deleted). Added `getStagedFiles()` which verifies the actual staged count via `git diff --cached`. The success notification now shows "staged N files" |

---

## v1.2.7

### Only README.md was uploaded — none of the project files made it 🔥

| Item | Details |
|------|---------|
| **Symptom** | After clicking Sync/Deploy, the GitHub repository contained only a `README.md`; all other project files were missing |
| **Root cause** | `stageFiles()` did: `git reset` to exclude files → then `git add .` to add everything back. **The order was reversed**, so the exclusions were undone. Also, on a brand-new repo (no HEAD) `git reset` failed silently |
| **Fix** | Changed to: `git add -A` first → then `git reset --` / `git rm --cached` to exclude secrets and build artifacts |

### Sidebar did not update after switching repositories

| Item | Details |
|------|---------|
| **Symptom** | Clicking switch under "Current repository" and picking a new repo left the sidebar repository name unchanged |
| **Root cause** | `handleSwitchRepo` only showed a message; it neither updated `origin` nor refreshed the UI |
| **Fix** | After switching it now automatically: updates `git remote` → rebuilds the `orchestrator` → refreshes the sidebar → triggers a state refresh |

---

## v1.2.6

### Clicking the "View on GitHub" button did nothing

| Item | Details |
|------|---------|
| **Symptom** | The success notification had a button, but clicking it did nothing |
| **Root cause** | The success branch of `showDeployResult()` was not `await`ed, so the button click's return value was discarded |
| **Fix** | `await` the success branch too → detect `open-repo` → open the repository URL in Edge/Chrome. Browser priority: Edge → Chrome → fallback to a message |

---

## v1.2.5

### Sidebar UI switched to a light-blue color scheme

> The old dark background was replaced with light blue (`#e8f4fd`) and white cards, for a cleaner look overall.

---

## v1.2.4

### VS Code's built-in GitHub sign-in popup jumped the gun

| Item | Details |
|------|---------|
| **Symptom** | Before any interaction with GitPilot, VS Code suddenly showed a "Connect to GitHub" sign-in dialog |
| **Root cause** | On activation the extension created a GitHub API instance via `new Octokit()` with no auth; VS Code detected the unauthenticated request and intercepted it with its own sign-in dialog |
| **Fix** | No Octokit is created at startup; `new Octokit({ auth: token })` only happens after a real login. All API calls are guarded by `ensureLoggedIn()` |

---

## v1.2.3

### No quick fix after a failed deploy → one-click repository linking

| Item | Details |
|------|---------|
| **Added** | The failure notification now includes a "🔗 Link Repository" button that lists your GitHub repositories; picking one runs `git remote add origin` automatically |

---

## v1.2.2

### Local git remote was not linked after creating a repository 🔥

| Item | Details |
|------|---------|
| **Symptom** | After clicking "Create Repository" the repo existed on GitHub, but local pushes failed with `'origin' does not appear to be a git repository` |
| **Root cause** | `handleCreateRepo` only created the repo on GitHub's side and never ran local `git init` + `git remote add` |
| **Fix** | After creation it now automatically runs: `git init` (if not a repo yet) → `git remote add origin <cloneUrl>`. Pushes also verify that origin exists |

---

## v1.2.1

### Refresh button only listed a count without fetching data

| Item | Details |
|------|---------|
| **Original** | Clicking refresh → "found N repositories" without ever calling the GitHub API |
| **Fix** | Really fetches the GitHub repository list + checks local Git status. A random 3–7 second delay (simulating network), with a 10-second timeout message "Error! Please check your network connection". Spinning button animation |

### GitHub avatar did not display

| Item | Details |
|------|---------|
| **Symptom** | After login only a 🐱 cat icon appeared instead of the real avatar |
| **Root cause** | The VS Code webview's default CSP blocked external images from `https://avatars.githubusercontent.com` |
| **Fix** | Added a `<meta>` tag in the HTML `<head>` allowing `img-src https: data:`. Falls back to 🐱 if loading fails |

---

## v1.2.0

### Deploy failed: `src refspec main does not match any` 🔥

| Item | Details |
|------|---------|
| **Symptom** | Clicking Deploy failed to push; Git reported that the branch did not exist |
| **Root cause** | The push hard-coded the `main` branch, but the repository's default branch might be `master`, or a brand-new repo might not have any branch yet |
| **Fix** | `push()` now verifies the branch exists → falls back to `getCurrentBranch()` → and if neither works, shows a clear error message |

### Sidebar UI fully redesigned

> From a crude pile of buttons → a modern card layout: account avatar card + repository selector + action buttons + build command + status bar.

---

## v1.1.1

### Switching tabs after login reverted the UI to "not logged in" 🔥

| Item | Details |
|------|---------|
| **Symptom** | Although logged in, switching to the file explorer and back reverted the sidebar to "not logged in" and the Deploy button disappeared |
| **Root cause** | VS Code **destroys the webview** when switching tabs; the rebuilt HTML always reset to its initial state |
| **Fix** | ① `retainContextWhenHidden: true` keeps the webview alive ② `SidebarProvider` remembers login state internally (`_isLoggedIn`, etc.) ③ the webview sends a `getState` request on load to restore state proactively |

---

## v1.1.0

### Login only had a PAT input, no browser login

| Item | Details |
|------|---------|
| **Original** | Clicking login → notification "opening login..." → PAT input. No browser was opened |
| **Added** | ① QuickPick to choose the login method (Browser OAuth / PAT Token) ② browser picker panel (detects installed Chrome/Edge/Firefox/Brave/Opera) ③ a local HTTP server receives the OAuth callback ④ the browser opens automatically to complete authorization |

---

## 📐 v1.0.0 (Starting Point)

> Initial version: manual PAT token login → create repository → basic Deploy/Sync flow. The problem: only the skeleton was built, and every step had pitfalls.

---

## 📊 Iteration Timeline

```
v1.0.0 ──→ v1.1.0 ──→ v1.1.1 ──→ v1.2.0 ──→ v1.2.1 ──→ v1.2.2
 skeleton   browser     state       UI          real        auto-link
            login       persistence redesign    refresh     remote
                                    branch fix  avatar

v1.2.3 ──→ v1.2.4 ──→ v1.2.5 ──→ v1.2.6 ──→ v1.2.7 ──→ v1.2.8 ──→ v1.2.9
 one-click  stop popup  light-blue  open in     fix upload  full        unpushed
 repo link  conflict    theme       browser     + refresh   staging     auto-push
```

---

## 🔧 Current Known Limitations

| Limitation | Impact | Plan |
|------------|--------|------|
| `OAUTH_CLIENT_ID` is a placeholder | Browser OAuth actually falls back to the PAT flow | Register a GitHub OAuth App |
| GitLab / Gitee not supported | Can only deploy to GitHub | The architecture already reserves Provider interfaces |
| Webview CSP restrictions | Some local resources fail to load | Switch to `webview.asWebviewUri()` later |
