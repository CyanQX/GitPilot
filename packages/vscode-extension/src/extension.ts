// ============================================================
// GitPilot VS Code Extension — 入口
//
// 架构：
//   Core (接口) ← Provider (GitHub 实现)
//   Core (接口) ← VSCode Provider (平台特定实现)
//   Core (DeployOrchestrator) ← 全部 Provider
//
// Core 不知道 VS Code，不知道 GitHub。
// ============================================================

import * as vscode from 'vscode';
import { Octokit } from '@octokit/rest';
import {
  DeployOrchestrator,
  TokenManager,
  SmartFilter,
  Logger,
} from '@gitpilot/core';
import type { DeployResult, DeployConfig, Repository, UserInfo } from '@gitpilot/core';
import {
  GitHubRepositoryProvider,
  GitHubAuthProvider,
  GitHubReleaseProvider,
} from '@gitpilot/provider-github';
import { VSCodeGitProvider } from './providers/vscode-git-provider';
import { VSCodeBuildProvider } from './providers/vscode-build-provider';
import { VSCodeNotificationProvider } from './providers/vscode-notification-provider';
import { VSCodeSecretStorage } from './providers/vscode-secret-storage';
import { VSCodeFileWatcherProvider } from './providers/vscode-file-watcher-provider';
import { SidebarProvider } from './ui/sidebar-provider';
import { promptBrowserSelection, performBrowserOAuth } from './providers/browser-auth-handler';

// ---- 全局状态 ----
let orchestrator: DeployOrchestrator | null = null;
let tokenManager: TokenManager;
let repoProvider: GitHubRepositoryProvider | null = null;
let authProvider: GitHubAuthProvider;
let releaseProvider: GitHubReleaseProvider | null = null;
let gitProvider: VSCodeGitProvider | null = null;
let notifier: VSCodeNotificationProvider;
let fileWatcher: VSCodeFileWatcherProvider;
let sidebarProvider: SidebarProvider;
let octokit: Octokit | null = null;
let scheduledTimer: ReturnType<typeof setInterval> | null = null;
let isLoggedIn = false;
let selectedRepo: Repository | null = null;
let activeGitAuthorName = 'CyanQX';
let activeGitAuthorEmail = 'CyanQX@users.noreply.github.com';

const logger = new Logger('VSCode');
const GIT_NOT_FOUND_PREFIX = 'GIT_NOT_FOUND:';
const NOT_GIT_REPO_PREFIX = 'NOT_GIT_REPO:';
const GIT_AUTHOR_MISSING_PREFIX = 'GIT_AUTHOR_MISSING:';
// ⭐ 替换为你的 GitHub OAuth App Client ID 即可启用浏览器 OAuth 登录
//    创建地址: https://github.com/settings/developers → New OAuth App
//    Homepage URL: http://localhost:52134
//    Callback URL: http://localhost:52134/callback
const OAUTH_CLIENT_ID: string = 'your-github-oauth-app-client-id';

/** 检测 OAuth 是否已配置（非占位符） */
function isOAuthConfigured(): boolean {
  return Boolean(OAUTH_CLIENT_ID && OAUTH_CLIENT_ID !== 'your-github-oauth-app-client-id' && OAUTH_CLIENT_ID.length > 5);
}

// ---- 激活 ----
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  try {
    logger.info('GitPilot 正在激活...');

    // 初始化平台特定 Provider
    const secretStorage = new VSCodeSecretStorage(context.secrets);
    tokenManager = new TokenManager(secretStorage);
    notifier = new VSCodeNotificationProvider();

    // GitHub Auth Provider 不需要 Token 即可创建
    authProvider = new GitHubAuthProvider(OAUTH_CLIENT_ID);
    // ⭐ 其他 Provider 等登录后再初始化（避免触发 VS Code 内置 GitHub 登录弹窗）
    repoProvider = null;
    releaseProvider = null;
    octokit = null;

    // 注册侧边栏
    sidebarProvider = new SidebarProvider(context.extensionUri);
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider('gitpilot-main', sidebarProvider),
    );

    // 注册命令
    registerCommands(context);

    // 自动恢复登录
    await autoRestoreSession(context);

    // 自动部署触发器
    initializeAutoDeploy(context);

    logger.info('GitPilot 已激活 ✓');
    vscode.window.showInformationMessage('🚀 GitPilot 已就绪！点左侧图标开始使用');
  } catch (e: any) {
    logger.error('激活失败: ' + e.message);
    vscode.window.showErrorMessage('GitPilot 启动失败: ' + e.message);
  }
}

export async function deactivate(): Promise<void> {
  const config = vscode.workspace.getConfiguration('gitpilot');
  if (config.get<boolean>('autoDeploy.onExit') && orchestrator) {
    try { await orchestrator.deploy(); } catch { /* 非关键 */ }
  }
  if (scheduledTimer) clearInterval(scheduledTimer);
  logger.info('GitPilot 已停用');
}

// ---- 命令注册 ----
function registerCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(vscode.commands.registerCommand('gitpilot.deploy', handleDeploy));
  context.subscriptions.push(vscode.commands.registerCommand('gitpilot.sync', handleSync));
  context.subscriptions.push(vscode.commands.registerCommand('gitpilot.login', handleLogin));
  context.subscriptions.push(vscode.commands.registerCommand('gitpilot.logout', handleLogout));
  context.subscriptions.push(vscode.commands.registerCommand('gitpilot.switchAccount', handleSwitchAccount));
  context.subscriptions.push(vscode.commands.registerCommand('gitpilot.createRepo', handleCreateRepo));
  context.subscriptions.push(vscode.commands.registerCommand('gitpilot.switchRepo', handleSwitchRepo));
  context.subscriptions.push(vscode.commands.registerCommand('gitpilot.refreshRepos', handleRefreshRepos));
  context.subscriptions.push(vscode.commands.registerCommand('gitpilot.refreshStatus', handleRefreshStatus));
  context.subscriptions.push(vscode.commands.registerCommand('gitpilot.linkRepo', handleLinkRepo));
  context.subscriptions.push(vscode.commands.registerCommand('gitpilot.openOnGitHub', openRepoInBrowser));
  context.subscriptions.push(vscode.commands.registerCommand('gitpilot.configureBuild', handleConfigureBuild));
  context.subscriptions.push(vscode.commands.registerCommand('gitpilot.configureGitAuthor', configureGitAuthorIdentity));
}

// ---- 命令处理 ----
/** 确保已登录，未登录则提示并返回 false */
function ensureLoggedIn(): boolean {
  if (!isLoggedIn || !octokit || !repoProvider) {
    vscode.window.showWarningMessage('请先登录 GitHub');
    return false;
  }
  return true;
}

function setActiveGitAuthor(user: Pick<UserInfo, 'login' | 'id' | 'name' | 'email'>): void {
  activeGitAuthorName = user.name || user.login || 'GitPilot';
  activeGitAuthorEmail = user.email || `${user.id}+${user.login}@users.noreply.github.com`;
}

function getActiveGitAuthor(): { name: string; email: string } {
  return {
    name: activeGitAuthorName || 'GitPilot',
    email: activeGitAuthorEmail || 'gitpilot@users.noreply.github.com',
  };
}

async function ensureGitAuthorIdentity(force = false): Promise<void> {
  if (!gitProvider) return;
  const author = getActiveGitAuthor();
  await gitProvider.ensureAuthorIdentity(author.name, author.email, force);
}

async function bindWorkspaceToRepository(repo: Repository, options: { showMessage?: boolean } = {}): Promise<boolean> {
  const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!wsRoot) {
    vscode.window.showErrorMessage('未打开工作区');
    return false;
  }

  if (!gitProvider) {
    gitProvider = new VSCodeGitProvider(wsRoot);
  }

  const isRepo = await gitProvider.isRepo();
  if (!isRepo) {
    await gitProvider.init();
    if (options.showMessage !== false) {
      vscode.window.showInformationMessage('已初始化本地 Git 仓库');
    }
  }

  await ensureGitAuthorIdentity();

  const existingUrl = await gitProvider.getRemoteUrl('origin').catch(() => null);
  if (existingUrl !== repo.cloneUrl) {
    await gitProvider.addRemote('origin', repo.cloneUrl);
  }

  selectedRepo = repo;
  sidebarProvider.setRepoName(repo.fullName);
  await initOrchestrator();

  if (options.showMessage !== false) {
    vscode.window.showInformationMessage(`已关联仓库: ${repo.fullName}`);
  }

  return true;
}

async function ensureLocalGitRepository(): Promise<boolean> {
  const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!wsRoot) {
    vscode.window.showErrorMessage('未打开工作区');
    return false;
  }

  if (!gitProvider) {
    gitProvider = new VSCodeGitProvider(wsRoot);
  }

  if (await gitProvider.isRepo()) {
    await ensureGitAuthorIdentity();
    const remoteUrl = await gitProvider.getRemoteUrl('origin').catch(() => null);
    if (selectedRepo && remoteUrl !== selectedRepo.cloneUrl) {
      return bindWorkspaceToRepository(selectedRepo, { showMessage: true });
    }
    return true;
  }

  if (selectedRepo) {
    return bindWorkspaceToRepository(selectedRepo, { showMessage: true });
  }

  const action = await vscode.window.showWarningMessage(
    '当前文件夹还不是 Git 仓库。请选择一个 GitHub 仓库进行关联，GitPilot 会自动初始化本地 Git。',
    { modal: false },
    '关联已有仓库',
    '创建仓库并关联',
  );

  if (action === '关联已有仓库') {
    await vscode.commands.executeCommand('gitpilot.linkRepo');
  } else if (action === '创建仓库并关联') {
    await vscode.commands.executeCommand('gitpilot.createRepo');
  }

  return false;
}

async function handleDeploy(): Promise<void> {
  try {
  if (!orchestrator) { vscode.window.showWarningMessage('请先登录 GitHub'); return; }
  if (!(await ensureLocalGitRepository())) return;

  // ⭐ 部署前检查 origin 远程是否配置
  if (gitProvider) {
    const remoteUrl = await gitProvider.getRemoteUrl('origin').catch(() => null);
    if (!remoteUrl) {
      if (selectedRepo) {
        const linked = await bindWorkspaceToRepository(selectedRepo, { showMessage: true });
        if (!linked) return;
      } else {
      const create = await vscode.window.showWarningMessage(
        '本地仓库未关联 GitHub 远程仓库。',
        { modal: false },
        '关联已有仓库',
        '创建仓库并关联',
      );
      if (create === '关联已有仓库') {
        await vscode.commands.executeCommand('gitpilot.linkRepo');
      } else if (create === '创建仓库并关联') {
        await vscode.commands.executeCommand('gitpilot.createRepo');
      }
      return;
      }
    }
  }

  // ⭐ 不提前检查 hasPendingChanges()，让 orchestrator.deploy() 内部处理：
  //   - 无变更 + 无未推送 → 返回 no-changes
  //   - 无变更 + 有未推送 → 直接 git push（v1.2.9）
  //   - 有变更 → 完整部署流程

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'GitPilot 部署中...', cancellable: true },
    async (progress, token) => {
      const result = await orchestrator!.deploy();
      if (!token.isCancellationRequested) await showDeployResult(result);
    },
  );
  } catch (e: any) { vscode.window.showErrorMessage(`部署异常: ${e.message}`); logger.error('Deploy error: ' + e.message); }
}

async function handleSync(): Promise<void> {
  try {
  if (!orchestrator) { vscode.window.showWarningMessage('请先登录 GitHub'); return; }
  if (!(await ensureLocalGitRepository())) return;
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'GitPilot 同步中...' },
    async () => { const r = await orchestrator!.sync(); await showDeployResult(r); },
  );
  } catch (e: any) { vscode.window.showErrorMessage(`同步异常: ${e.message}`); }
}

async function handleLogin(): Promise<void> {
  try {
    // ⭐ 如果 OAuth 未配置，直接走 PAT Token 登录（最可靠的方式）
    if (!isOAuthConfigured()) {
      await loginWithPAT();
      return;
    }

    // OAuth 已配置 → 提供两种登录方式选择
    const method = await vscode.window.showQuickPick(
      [
        {
          label: '🔐 浏览器 OAuth 登录',
          description: '✨ 推荐',
          detail: '自动打开浏览器完成 GitHub 授权，安全便捷',
        },
        {
          label: '🔑 Personal Access Token',
          description: '手动输入',
          detail: '使用 GitHub Personal Access Token 登录（需要 repo + workflow 权限）',
        },
      ],
      { placeHolder: '选择 GitHub 登录方式', title: 'GitPilot · 登录 GitHub' },
    );

    if (!method) return;

    if (method.label.includes('Token')) {
      await loginWithPAT();
    } else {
      await loginWithBrowserOAuth();
    }
  } catch (e: any) {
    vscode.window.showErrorMessage(`登录失败: ${e.message}`);
    logger.error('Login error: ' + e.message + '\n' + e.stack);
  }
}

// ---- PAT 登录（保留原有流程） ----
async function loginWithPAT(): Promise<void> {
  const token = await vscode.window.showInputBox({
    prompt: '输入 GitHub Personal Access Token\n（需要 repo + workflow 权限）\n创建: https://github.com/settings/tokens',
    password: true,
    placeHolder: 'ghp_xxxxxxxxxxxx',
    ignoreFocusOut: true,
  });
  if (!token) { vscode.window.showWarningMessage('已取消登录'); return; }

  vscode.window.showInformationMessage('正在验证 Token...');
  const isValid = await authProvider.validateToken(token);
  if (!isValid) { vscode.window.showErrorMessage('Token 无效，请检查权限是否包含 repo 和 workflow'); return; }

  const user = await authProvider.getUserInfo(token);
  await tokenManager.save(user.login, token, 'github');

  await completeLogin(token, user);
}

// ---- 浏览器 OAuth 登录（新流程） ----
async function loginWithBrowserOAuth(): Promise<void> {
  // ⭐ 二次防护：OAuth 未配置时直接拦截，防止打开无效的授权页面
  if (!isOAuthConfigured()) {
    const usePat = await vscode.window.showWarningMessage(
      '浏览器 OAuth 登录尚未配置（需要注册 GitHub OAuth App）。\n建议使用 Personal Access Token 登录。',
      { modal: true },
      '使用 PAT Token 登录',
    );
    if (usePat === '使用 PAT Token 登录') {
      await loginWithPAT();
    }
    return;
  }

  // 1. 弹出浏览器选择面板
  const browser = await promptBrowserSelection();
  if (browser === undefined) return; // 用户取消选择

  // 2. 构建 OAuth 授权 URL
  const authUrl = authProvider.getAuthorizationUrl();

  // 3. 执行浏览器 OAuth 流程
  const browserName = browser ? browser.name : '系统默认浏览器';
  vscode.window.showInformationMessage(`正在用 ${browserName} 打开 GitHub 授权页面...`);

  const code = await performBrowserOAuth(authUrl, browser);

  // 4. 用授权码换取 Token
  vscode.window.showInformationMessage('正在获取访问令牌...');
  const authToken = await authProvider.exchangeCodeForToken(code);

  // 5. 验证并获取用户信息
  const user = await authProvider.getUserInfo(authToken.accessToken);
  await tokenManager.save(user.login, authToken.accessToken, 'github');

  await completeLogin(authToken.accessToken, user);
}

// ---- 登录完成后的统一处理 ----
async function completeLogin(token: string, user: UserInfo): Promise<void> {
  octokit = new Octokit({ auth: token });
  repoProvider = new GitHubRepositoryProvider(octokit);
  releaseProvider = new GitHubReleaseProvider(octokit);
  isLoggedIn = true;
  setActiveGitAuthor(user);

  await initOrchestrator();
  vscode.commands.executeCommand('setContext', 'gitpilot:loggedIn', true);
  vscode.window.showInformationMessage(`✅ 已登录: ${user.login}`);
  sidebarProvider.setLoggedIn(user.login, user.avatarUrl ?? undefined);
}

async function handleLogout(): Promise<void> {
  const confirm = await vscode.window.showWarningMessage('确定登出？', { modal: true }, '登出');
  if (confirm !== '登出') return;
  await tokenManager.clearAll();
  orchestrator = null;
  octokit = null;
  repoProvider = null;
  releaseProvider = null;
  selectedRepo = null;
  isLoggedIn = false;
  vscode.commands.executeCommand('setContext', 'gitpilot:loggedIn', false);
  vscode.window.showInformationMessage('已登出');
  sidebarProvider.setLoggedOut();
}

async function handleSwitchAccount(): Promise<void> {
  if (!ensureLoggedIn()) return;
  const accounts = await tokenManager.getAccounts();
  if (accounts.length === 0) { vscode.window.showInformationMessage('无已保存账号'); return; }
  const items = accounts.map((a) => ({ label: a.login, description: `${a.platform} · ${new Date(a.lastUsedAt).toLocaleDateString()}` }));
  const picked = await vscode.window.showQuickPick(items, { placeHolder: '选择账号' });
  if (!picked) return;
  await tokenManager.switchTo(picked.label);
  const token = await tokenManager.get(picked.label);
  if (token) {
    octokit = new Octokit({ auth: token });
    repoProvider = new GitHubRepositoryProvider(octokit);
    releaseProvider = new GitHubReleaseProvider(octokit);
    try {
      const user = await authProvider.getUserInfo(token);
      setActiveGitAuthor(user);
      sidebarProvider.setLoggedIn(user.login, user.avatarUrl ?? undefined);
    } catch {
      activeGitAuthorName = picked.label;
      activeGitAuthorEmail = `${picked.label}@users.noreply.github.com`;
    }
    await initOrchestrator();
  }
  vscode.window.showInformationMessage(`已切换: ${picked.label}`);
}

async function handleCreateRepo(): Promise<void> {
  if (!ensureLoggedIn()) return;
  const provider = repoProvider;
  if (!provider) return;
  const name = await vscode.window.showInputBox({ prompt: '仓库名称', placeHolder: 'my-project' });
  if (!name) return;
  const priv = await vscode.window.showQuickPick(['公开', '私有'], { placeHolder: '可见性' });
  if (!priv) return;
  try {
    const repo = await provider.createRepo({ name, private: priv === '私有', autoInit: true });
    vscode.window.showInformationMessage(`✅ 已创建: ${repo.fullName}`);

    await bindWorkspaceToRepository(repo, { showMessage: true });
  } catch (e: any) { vscode.window.showErrorMessage(`创建失败: ${e.message}`); }
}

async function handleSwitchRepo(): Promise<void> {
  if (!ensureLoggedIn()) return;
  try {
    const repos = await repoProvider!.listRepos();
    const items = repos.map((r) => ({
      label: r.fullName,
      description: r.private ? '🔒 Private' : '🌐 Public',
      detail: r.cloneUrl,
      repo: r,
    }));
    const picked = await vscode.window.showQuickPick(items, { placeHolder: '选择仓库', matchOnDescription: true });
    if (!picked) return;

    const linked = await bindWorkspaceToRepository(picked.repo, { showMessage: false });
    if (!linked) return;

    vscode.window.showInformationMessage(`✅ 已切换并关联至: ${picked.repo.fullName}`);
    // ⭐ 自动刷新状态
    vscode.commands.executeCommand('gitpilot.refreshStatus');
  } catch (e: any) { vscode.window.showErrorMessage(`切换失败: ${e.message}`); }
}

async function handleRefreshRepos(): Promise<void> {
  if (!ensureLoggedIn()) return;
  try {
    const repos = await repoProvider!.listRepos();
    vscode.window.showInformationMessage(`找到 ${repos.length} 个仓库`);
  } catch (e: any) { vscode.window.showErrorMessage(`刷新失败: ${e.message}`); }
}

// ⭐ 一键关联 GitHub 仓库
async function handleLinkRepo(): Promise<void> {
  if (!ensureLoggedIn()) return;
  try {
    const repos = await repoProvider!.listRepos();
    if (repos.length === 0) {
      const create = await vscode.window.showInformationMessage(
        '你还没有 GitHub 仓库，是否创建一个？',
        '创建仓库',
      );
      if (create === '创建仓库') {
        vscode.commands.executeCommand('gitpilot.createRepo');
      }
      return;
    }

    const items = repos.map((r) => ({
      label: r.fullName,
      description: r.private ? '🔒' : '🌐',
      detail: r.cloneUrl,
      repo: r,
    }));

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: '选择要关联的 GitHub 仓库',
      title: 'GitPilot · 关联远程仓库',
      matchOnDescription: true,
    });
    if (!picked) return;

    await bindWorkspaceToRepository(picked.repo, { showMessage: true });
  } catch (e: any) {
    vscode.window.showErrorMessage(`关联失败: ${e.message}`);
  }
}

// ⭐ 真实刷新状态（从 GitHub API 拉取仓库列表 + Git 本地状态）
async function handleRefreshStatus(): Promise<void> {
  if (!ensureLoggedIn()) {
    sidebarProvider.postMessage({ refreshState: 'error', statusText: '请先登录', status: '❌ 未登录' });
    return;
  }
  // 通知侧边栏开始加载动画
  sidebarProvider.postMessage({ refreshState: 'start' });

  const timeoutMs = 10000; // 10 秒超时

  try {
    const result = await Promise.race([
      (async () => {
        // 实际刷新操作：获取仓库列表 + Git 状态
        const repos = await repoProvider!.listRepos();
        let gitStatusInfo = '';
        try {
          if (orchestrator) {
            const hasChanges = await orchestrator.hasPendingChanges();
            gitStatusInfo = hasChanges ? ' · 有未部署变更' : ' · 已是最新';
          }
        } catch { /* git status 非关键 */ }

        return { repos, gitStatusInfo };
      })(),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error('TIMEOUT')), timeoutMs)
      ),
    ]);

    // 刷新成功
    const statusMsg = `已同步 ${result.repos.length} 个仓库${result.gitStatusInfo}`;
    sidebarProvider.postMessage({
      refreshState: 'done',
      statusText: statusMsg,
      status: '✅ 就绪',
    });
  } catch (e: any) {
    // 超时或错误
    logger.error('Refresh error: ' + (e.message ?? String(e)));
    sidebarProvider.postMessage({
      refreshState: 'error',
      statusText: '报错！请检查网络是否正常',
      status: '❌ 刷新失败',
    });
  }
}

async function handleConfigureBuild(): Promise<void> {
  const config = vscode.workspace.getConfiguration('gitpilot');
  const cmd = await vscode.window.showInputBox({
    prompt: '输入构建命令（不猜测语言，你自己写）',
    placeHolder: 'npm run build / cargo build --release / ...',
    value: config.get<string>('build.command') ?? '',
  });
  if (cmd === undefined) return;
  const beforeDeploy = await vscode.window.showQuickPick(['是', '否'], { placeHolder: '部署前执行 Build？' });
  const blockOnFail = await vscode.window.showQuickPick(['是', '否'], { placeHolder: 'Build 失败时阻止部署？' });
  await config.update('build.command', cmd, vscode.ConfigurationTarget.Workspace);
  await config.update('build.beforeDeploy', beforeDeploy === '是', vscode.ConfigurationTarget.Workspace);
  await config.update('build.blockOnFailure', blockOnFail === '是', vscode.ConfigurationTarget.Workspace);
  vscode.window.showInformationMessage('✅ 构建配置已更新');
}

async function configureGitAuthorIdentity(): Promise<void> {
  const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!wsRoot) {
    vscode.window.showErrorMessage('未打开工作区');
    return;
  }

  if (!gitProvider) {
    gitProvider = new VSCodeGitProvider(wsRoot);
  }

  if (!(await gitProvider.isRepo())) {
    await gitProvider.init();
  }

  const current = getActiveGitAuthor();
  const name = await vscode.window.showInputBox({
    prompt: '输入 Git 提交用户名',
    value: current.name,
    ignoreFocusOut: true,
  });
  if (!name) return;

  const email = await vscode.window.showInputBox({
    prompt: '输入 Git 提交邮箱',
    value: current.email,
    ignoreFocusOut: true,
  });
  if (!email) return;

  activeGitAuthorName = name;
  activeGitAuthorEmail = email;
  await gitProvider.ensureAuthorIdentity(name, email, true);
  vscode.window.showInformationMessage('Git 作者身份已配置');
}

function stripErrorPrefix(error: string, prefix: string): string {
  const index = error.indexOf(prefix);
  return index >= 0 ? error.slice(index + prefix.length) : error;
}

// ---- 部署结果展示 ----
async function showDeployResult(result: DeployResult): Promise<void> {
  if (result.success && result.status === 'no-changes') return;
  if (result.success) {
    // ⭐ 从步骤中提取暂存文件数
    const stageStep = result.steps?.find((s: any) => s.name === '暂存文件');
    const fileInfo = stageStep?.details ? ` · ${stageStep.details}` : '';

    const actionId = await notifier.show({
      type: 'success', title: '🚀 部署成功！',
      message: `提交: ${result.commitHash?.substring(0, 7) ?? '--'}${fileInfo} · 耗时 ${(result.totalDurationMs / 1000).toFixed(1)}s`,
      actions: [
        { label: '在 GitHub 上查看', id: 'open-repo' },
        ...(result.releaseUrl ? [{ label: '查看 Release', id: 'open-release' }] : []),
      ],
    });

    if (actionId === 'open-repo') {
      await openRepoInBrowser();
    } else if (actionId === 'open-release' && result.releaseUrl) {
      await openUrlInBrowser(result.releaseUrl);
    }
  } else {
    const errorText = result.error ?? '';
    const isOriginMissing = errorText.includes('ORIGIN_MISSING:');
    const isGitNotFound = errorText.includes(GIT_NOT_FOUND_PREFIX);
    const isNotGitRepo = errorText.includes(NOT_GIT_REPO_PREFIX);
    const isAuthorMissing = errorText.includes(GIT_AUTHOR_MISSING_PREFIX);
    const isNetworkError = errorText.includes('NETWORK_');

    let displayMsg: string;
    if (isOriginMissing) {
      displayMsg = '本地仓库未关联 GitHub 远程地址';
    } else if (isGitNotFound) {
      displayMsg = stripErrorPrefix(errorText, GIT_NOT_FOUND_PREFIX);
    } else if (isNotGitRepo) {
      displayMsg = stripErrorPrefix(errorText, NOT_GIT_REPO_PREFIX);
    } else if (isAuthorMissing) {
      displayMsg = stripErrorPrefix(errorText, GIT_AUTHOR_MISSING_PREFIX);
    } else if (isNetworkError) {
      // ⭐ 网络错误 → 提取友好消息（去掉前缀）
      displayMsg = errorText.replace(/^.*?(NETWORK_\w+:)/, '').replace(/^NETWORK_\w+:/, '');
    } else {
      displayMsg = errorText || '未知错误';
    }

    const actions: { label: string; id: string }[] = [];
    if (isOriginMissing || isNotGitRepo) {
      actions.push({ label: '创建仓库并关联', id: 'create-repo' });
      actions.push({ label: '🔗 关联仓库', id: 'link-repo' });
    }
    if (isAuthorMissing) actions.push({ label: '配置 Git 作者', id: 'configure-author' });
    if (isNetworkError) actions.push({ label: '⏳ 3秒后重试', id: 'retry-delayed' });
    actions.push({ label: '重试', id: 'retry' });

    const actionId = await notifier.show({
      type: 'error', title: '❌ 部署失败',
      message: displayMsg,
      actions,
    });

    if (actionId === 'create-repo') {
      await handleCreateRepo();
    } else if (actionId === 'link-repo') {
      await handleLinkRepo();
    } else if (actionId === 'configure-author') {
      await configureGitAuthorIdentity();
    } else if (actionId === 'retry-delayed') {
      // ⭐ 网络错误：等 3 秒再重试
      vscode.window.showInformationMessage('⏳ 3 秒后自动重试...');
      await new Promise(r => setTimeout(r, 3000));
      vscode.commands.executeCommand('gitpilot.deploy');
    } else if (actionId === 'retry') {
      vscode.commands.executeCommand('gitpilot.deploy');
    }
  }
}

// ⭐ 用浏览器打开指定 URL（优先 Edge → Chrome → 报错）
async function openUrlInBrowser(url: string): Promise<void> {
  const { exec } = require('child_process');
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  // 检测 Edge 路径
  const edgePaths = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  // 检测 Chrome 路径
  const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
  const chromePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(localAppData, 'Google\\Chrome\\Application\\chrome.exe'),
  ];

  let browserPath: string | null = null;
  let browserName = '';

  // 优先 Edge
  for (const p of edgePaths) {
    if (fs.existsSync(p)) { browserPath = p; browserName = 'Edge'; break; }
  }
  // 其次 Chrome
  if (!browserPath) {
    for (const p of chromePaths) {
      if (fs.existsSync(p)) { browserPath = p; browserName = 'Chrome'; break; }
    }
  }

  if (!browserPath) {
    vscode.window.showErrorMessage(
      '您的浏览器似乎不在我们的许可中，请更换至对应浏览器（参考 Edge 浏览器和 Google 浏览器）',
    );
    return;
  }

  return new Promise((resolve) => {
    exec(`start "" "${browserPath}" "${url}"`, { timeout: 5000 }, (err: any) => {
      if (err) {
        // 回退到 VS Code 内置打开方式
        vscode.env.openExternal(vscode.Uri.parse(url));
      }
      resolve();
    });
  });
}

// ⭐ 打开当前仓库的 GitHub 页面
async function openRepoInBrowser(): Promise<void> {
  // 尝试从 git remote 获取 URL
  let repoUrl: string | null = null;
  try {
    if (gitProvider) {
      const remoteUrl = await gitProvider.getRemoteUrl('origin');
      if (remoteUrl) {
        repoUrl = remoteUrl
          .replace(/\.git$/, '')
          .replace(/^git@github\.com:/, 'https://github.com/');
      }
    }
  } catch { /* ignore */ }

  if (!repoUrl) {
    vscode.window.showErrorMessage('无法获取仓库地址，请手动打开 GitHub。');
    return;
  }

  await openUrlInBrowser(repoUrl);
}

// ---- 初始化 Orchestrator ----
async function initOrchestrator(): Promise<void> {
  if (!repoProvider || !releaseProvider) {
    logger.warn('GitHub Provider 未初始化，请先登录');
    return;
  }
  const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!wsRoot) { logger.warn('未打开工作区'); return; }

  const config = vscode.workspace.getConfiguration('gitpilot');
  gitProvider = new VSCodeGitProvider(wsRoot);
  const buildProvider = new VSCodeBuildProvider();
  const smartFilter = new SmartFilter(wsRoot, {
    blockSecrets: config.get<boolean>('security.blockSecrets'),
  });
  try {
    if (await gitProvider.isRepo()) {
      await ensureGitAuthorIdentity();
    }
  } catch { /* keep deploy setup non-blocking */ }

  // ⭐ 智能检测当前分支：先查当前分支，失败则列本地分支取第一个
  let branch = 'main';
  try {
    const b = await gitProvider.getCurrentBranch();
    if (b && b !== 'HEAD') branch = b;
  } catch {
    // getCurrentBranch 失败，尝试回退
    try {
      const status = await gitProvider.getStatus();
      if (status.currentBranch && status.currentBranch !== 'HEAD' && status.currentBranch !== 'unknown') {
        branch = status.currentBranch;
      }
    } catch { /* 保持 main 作为默认值 */ }
  }

  const remoteUrl = await gitProvider.getRemoteUrl().catch(() => null);
  const repoName = parseRepoFromUrl(remoteUrl);
  const effectiveRepo = repoName
    ? {
      owner: repoName.owner,
      name: repoName.name,
      fullName: `${repoName.owner}/${repoName.name}`,
      defaultBranch: selectedRepo?.fullName === `${repoName.owner}/${repoName.name}` ? selectedRepo.defaultBranch : undefined,
    }
    : selectedRepo
      ? {
        owner: selectedRepo.owner,
        name: selectedRepo.name,
        fullName: selectedRepo.fullName,
        defaultBranch: selectedRepo.defaultBranch,
      }
      : null;

  // ⭐ 更新侧边栏仓库信息
  if (effectiveRepo) {
    sidebarProvider.setRepoName(effectiveRepo.fullName);
  }
  const buildCmd = config.get<string>('build.command');
  if (buildCmd) {
    sidebarProvider.setBuildCmd(buildCmd);
  }

  const deployConfig: DeployConfig = {
    repo: { owner: effectiveRepo?.owner ?? 'unknown', name: effectiveRepo?.name ?? 'unknown', fullName: effectiveRepo?.fullName ?? 'unknown' },
    branch: branch === 'main' && effectiveRepo?.defaultBranch ? effectiveRepo.defaultBranch : branch,
    trigger: 'manual',
    commitMessageTemplate: config.get<string>('commit.messageTemplate') ?? 'deploy: auto-deploy by GitPilot',
    buildCommand: config.get<string>('build.command') || undefined,
    buildBeforeDeploy: config.get<boolean>('build.beforeDeploy'),
    blockOnBuildFailure: config.get<boolean>('build.blockOnFailure'),
    release: config.get<boolean>('release.enabled') ? {
      enabled: true,
      artifactPaths: config.get<string[]>('release.artifactPaths'),
    } : undefined,
  };

  orchestrator = new DeployOrchestrator(
    deployConfig, repoProvider, gitProvider, buildProvider, releaseProvider, notifier, smartFilter,
  );
}

// ---- 自动登录恢复 ----
async function autoRestoreSession(context: vscode.ExtensionContext): Promise<void> {
  const token = await tokenManager.getActive();
  if (!token) { vscode.commands.executeCommand('setContext', 'gitpilot:loggedIn', false); return; }

  const isValid = await authProvider.validateToken(token);
  if (!isValid) {
    await tokenManager.clearAll();
    vscode.commands.executeCommand('setContext', 'gitpilot:loggedIn', false);
    return;
  }

  octokit = new Octokit({ auth: token });
  repoProvider = new GitHubRepositoryProvider(octokit);
  releaseProvider = new GitHubReleaseProvider(octokit);
  isLoggedIn = true;
  await initOrchestrator();
  vscode.commands.executeCommand('setContext', 'gitpilot:loggedIn', true);
  logger.info('Session 已恢复');
  // 获取用户名用于侧边栏显示
  try {
    const user = await authProvider.getUserInfo(token);
    setActiveGitAuthor(user);
    sidebarProvider.setLoggedIn(user.login, user.avatarUrl ?? undefined);
  } catch {
    sidebarProvider.setLoggedIn('GitHub');
  }
}

// ---- 自动部署触发器 ----
function initializeAutoDeploy(context: vscode.ExtensionContext): void {
  const config = vscode.workspace.getConfiguration('gitpilot');

  if (config.get<boolean>('autoDeploy.onSave')) {
    const delay = (config.get<number>('autoDeploy.onSaveDelay') ?? 3) * 1000;
    let timer: ReturnType<typeof setTimeout> | null = null;
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => { if (orchestrator) await orchestrator.deploy(); }, delay);
    }));
  }

  if (config.get<boolean>('autoDeploy.scheduled')) {
    const interval = parseInterval(config.get<string>('autoDeploy.scheduledInterval') ?? '30min');
    scheduledTimer = setInterval(async () => {
      // ⭐ 不预检查，让 orchestrator 内部处理所有情况（含未推送提交检测）
      if (orchestrator) await orchestrator.deploy();
    }, interval);
  }
}

// ---- 辅助函数 ----
function parseRepoFromUrl(url: string | null): { owner: string; name: string } | null {
  if (!url) return null;
  const m = url.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
  return m ? { owner: m[1], name: m[2] } : null;
}

function parseInterval(s: string): number {
  const map: Record<string, number> = {
    '10min': 600000, '30min': 1800000, '1h': 3600000,
    '2h': 7200000, '4h': 14400000, 'daily': 86400000,
  };
  return map[s] ?? 1800000;
}
