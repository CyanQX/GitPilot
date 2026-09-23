// ============================================================
// GitPilot VS Code Extension — entry point
//
// Architecture:
//   Core (interfaces) ← Provider (GitHub implementation)
//   Core (interfaces) ← VSCode Provider (platform-specific implementation)
//   Core (DeployOrchestrator) ← all Providers
//
// Core does not know about VS Code, nor about GitHub.
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

// ---- Global state ----
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
// ⭐ Replace with your GitHub OAuth App Client ID to enable browser OAuth login
//    Create one at: https://github.com/settings/developers → New OAuth App
//    Homepage URL: http://localhost:52134
//    Callback URL: http://localhost:52134/callback
const OAUTH_CLIENT_ID: string = 'your-github-oauth-app-client-id';

/** Check whether OAuth is configured (not a placeholder) */
function isOAuthConfigured(): boolean {
  return Boolean(OAUTH_CLIENT_ID && OAUTH_CLIENT_ID !== 'your-github-oauth-app-client-id' && OAUTH_CLIENT_ID.length > 5);
}

// ---- Activation ----
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  try {
    logger.info('GitPilot is activating...');

    // Initialize platform-specific providers
    const secretStorage = new VSCodeSecretStorage(context.secrets);
    tokenManager = new TokenManager(secretStorage);
    notifier = new VSCodeNotificationProvider();

    // The GitHub Auth Provider can be created without a token
    authProvider = new GitHubAuthProvider(OAUTH_CLIENT_ID);
    // ⭐ Other providers are initialized after login (to avoid triggering VS Code's built-in GitHub sign-in popup)
    repoProvider = null;
    releaseProvider = null;
    octokit = null;

    // Register the sidebar
    sidebarProvider = new SidebarProvider(context.extensionUri);
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider('gitpilot-main', sidebarProvider),
    );

    // Register commands
    registerCommands(context);

    // Restore the session automatically
    await autoRestoreSession(context);

    // Auto deploy triggers
    initializeAutoDeploy(context);

    logger.info('GitPilot activated ✓');
    vscode.window.showInformationMessage('🚀 GitPilot is ready! Click the icon on the left to start');
  } catch (e: any) {
    logger.error('Activation failed: ' + e.message);
    vscode.window.showErrorMessage('GitPilot failed to start: ' + e.message);
  }
}

export async function deactivate(): Promise<void> {
  const config = vscode.workspace.getConfiguration('gitpilot');
  if (config.get<boolean>('autoDeploy.onExit') && orchestrator) {
    try { await orchestrator.deploy(); } catch { /* non-critical */ }
  }
  if (scheduledTimer) clearInterval(scheduledTimer);
  logger.info('GitPilot deactivated');
}

// ---- Command registration ----
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

// ---- Command handlers ----
/** Ensure the user is logged in; if not, show a message and return false */
function ensureLoggedIn(): boolean {
  if (!isLoggedIn || !octokit || !repoProvider) {
    vscode.window.showWarningMessage('Please sign in to GitHub first');
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
    vscode.window.showErrorMessage('No workspace is open');
    return false;
  }

  if (!gitProvider) {
    gitProvider = new VSCodeGitProvider(wsRoot);
  }

  const isRepo = await gitProvider.isRepo();
  if (!isRepo) {
    await gitProvider.init();
    if (options.showMessage !== false) {
      vscode.window.showInformationMessage('Local Git repository initialized');
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
    vscode.window.showInformationMessage(`Linked repository: ${repo.fullName}`);
  }

  return true;
}

async function ensureLocalGitRepository(): Promise<boolean> {
  const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!wsRoot) {
    vscode.window.showErrorMessage('No workspace is open');
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
    'This folder is not a Git repository yet. Select a GitHub repository to link, and GitPilot will initialize local Git automatically.',
    { modal: false },
    'Link an existing repository',
    'Create a repository and link it',
  );

  if (action === 'Link an existing repository') {
    await vscode.commands.executeCommand('gitpilot.linkRepo');
  } else if (action === 'Create a repository and link it') {
    await vscode.commands.executeCommand('gitpilot.createRepo');
  }

  return false;
}

async function handleDeploy(): Promise<void> {
  try {
  if (!orchestrator) { vscode.window.showWarningMessage('Please sign in to GitHub first'); return; }
  if (!(await ensureLocalGitRepository())) return;

  // ⭐ Check whether the origin remote is configured before deploying
  if (gitProvider) {
    const remoteUrl = await gitProvider.getRemoteUrl('origin').catch(() => null);
    if (!remoteUrl) {
      if (selectedRepo) {
        const linked = await bindWorkspaceToRepository(selectedRepo, { showMessage: true });
        if (!linked) return;
      } else {
      const create = await vscode.window.showWarningMessage(
        'The local repository is not linked to a GitHub remote.',
        { modal: false },
        'Link an existing repository',
        'Create a repository and link it',
      );
      if (create === 'Link an existing repository') {
        await vscode.commands.executeCommand('gitpilot.linkRepo');
      } else if (create === 'Create a repository and link it') {
        await vscode.commands.executeCommand('gitpilot.createRepo');
      }
      return;
      }
    }
  }

  // ⭐ Do not pre-check hasPendingChanges(); let orchestrator.deploy() handle everything internally:
  //   - no changes + nothing unpushed → returns no-changes
  //   - no changes + unpushed commits → pushes directly (v1.2.9)
  //   - changes → full deploy flow

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'GitPilot deploying...', cancellable: true },
    async (progress, token) => {
      const result = await orchestrator!.deploy();
      if (!token.isCancellationRequested) await showDeployResult(result);
    },
  );
  } catch (e: any) { vscode.window.showErrorMessage(`Deploy error: ${e.message}`); logger.error('Deploy error: ' + e.message); }
}

async function handleSync(): Promise<void> {
  try {
  if (!orchestrator) { vscode.window.showWarningMessage('Please sign in to GitHub first'); return; }
  if (!(await ensureLocalGitRepository())) return;
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'GitPilot syncing...' },
    async () => { const r = await orchestrator!.sync(); await showDeployResult(r); },
  );
  } catch (e: any) { vscode.window.showErrorMessage(`Sync error: ${e.message}`); }
}

async function handleLogin(): Promise<void> {
  try {
    // ⭐ If OAuth is not configured, go straight to PAT token login (the most reliable option)
    if (!isOAuthConfigured()) {
      await loginWithPAT();
      return;
    }

    // OAuth configured → offer both login methods
    const method = await vscode.window.showQuickPick(
      [
        {
          label: '🔐 Browser OAuth login',
          description: '✨ Recommended',
          detail: 'Opens the browser to complete GitHub authorization — safe and easy',
        },
        {
          label: '🔑 Personal Access Token',
          description: 'Enter manually',
          detail: 'Sign in with a GitHub Personal Access Token (requires repo + workflow scopes)',
        },
      ],
      { placeHolder: 'Choose a GitHub sign-in method', title: 'GitPilot · Sign in to GitHub' },
    );

    if (!method) return;

    if (method.label.includes('Token')) {
      await loginWithPAT();
    } else {
      await loginWithBrowserOAuth();
    }
  } catch (e: any) {
    vscode.window.showErrorMessage(`Login failed: ${e.message}`);
    logger.error('Login error: ' + e.message + '\n' + e.stack);
  }
}

// ---- PAT login (original flow) ----
async function loginWithPAT(): Promise<void> {
  const token = await vscode.window.showInputBox({
    prompt: 'Enter your GitHub Personal Access Token\n(requires repo + workflow scopes)\nCreate one at: https://github.com/settings/tokens',
    password: true,
    placeHolder: 'ghp_xxxxxxxxxxxx',
    ignoreFocusOut: true,
  });
  if (!token) { vscode.window.showWarningMessage('Login cancelled'); return; }

  vscode.window.showInformationMessage('Validating token...');
  const isValid = await authProvider.validateToken(token);
  if (!isValid) { vscode.window.showErrorMessage('Invalid token. Please check that it has the repo and workflow scopes.'); return; }

  const user = await authProvider.getUserInfo(token);
  await tokenManager.save(user.login, token, 'github');

  await completeLogin(token, user);
}

// ---- Browser OAuth login (new flow) ----
async function loginWithBrowserOAuth(): Promise<void> {
  // ⭐ Second guard: block early when OAuth is not configured, to avoid opening an invalid authorization page
  if (!isOAuthConfigured()) {
    const usePat = await vscode.window.showWarningMessage(
      'Browser OAuth login is not configured yet (a GitHub OAuth App must be registered).\nPlease use a Personal Access Token instead.',
      { modal: true },
      'Sign in with PAT Token',
    );
    if (usePat === 'Sign in with PAT Token') {
      await loginWithPAT();
    }
    return;
  }

  // 1. Show the browser picker panel
  const browser = await promptBrowserSelection();
  if (browser === undefined) return; // user cancelled the selection

  // 2. Build the OAuth authorization URL
  const authUrl = authProvider.getAuthorizationUrl();

  // 3. Run the browser OAuth flow
  const browserName = browser ? browser.name : 'System default browser';
  vscode.window.showInformationMessage(`Opening the GitHub authorization page with ${browserName}...`);

  const code = await performBrowserOAuth(authUrl, browser);

  // 4. Exchange the authorization code for a token
  vscode.window.showInformationMessage('Fetching access token...');
  const authToken = await authProvider.exchangeCodeForToken(code);

  // 5. Validate and get user info
  const user = await authProvider.getUserInfo(authToken.accessToken);
  await tokenManager.save(user.login, authToken.accessToken, 'github');

  await completeLogin(authToken.accessToken, user);
}

// ---- Shared post-login handling ----
async function completeLogin(token: string, user: UserInfo): Promise<void> {
  octokit = new Octokit({ auth: token });
  repoProvider = new GitHubRepositoryProvider(octokit);
  releaseProvider = new GitHubReleaseProvider(octokit);
  isLoggedIn = true;
  setActiveGitAuthor(user);

  await initOrchestrator();
  vscode.commands.executeCommand('setContext', 'gitpilot:loggedIn', true);
  vscode.window.showInformationMessage(`✅ Signed in: ${user.login}`);
  sidebarProvider.setLoggedIn(user.login, user.avatarUrl ?? undefined);
}

async function handleLogout(): Promise<void> {
  const confirm = await vscode.window.showWarningMessage('Sign out?', { modal: true }, 'Sign out');
  if (confirm !== 'Sign out') return;
  await tokenManager.clearAll();
  orchestrator = null;
  octokit = null;
  repoProvider = null;
  releaseProvider = null;
  selectedRepo = null;
  isLoggedIn = false;
  vscode.commands.executeCommand('setContext', 'gitpilot:loggedIn', false);
  vscode.window.showInformationMessage('Signed out');
  sidebarProvider.setLoggedOut();
}

async function handleSwitchAccount(): Promise<void> {
  if (!ensureLoggedIn()) return;
  const accounts = await tokenManager.getAccounts();
  if (accounts.length === 0) { vscode.window.showInformationMessage('No saved accounts'); return; }
  const items = accounts.map((a) => ({ label: a.login, description: `${a.platform} · ${new Date(a.lastUsedAt).toLocaleDateString()}` }));
  const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Choose an account' });
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
  vscode.window.showInformationMessage(`Switched to: ${picked.label}`);
}

async function handleCreateRepo(): Promise<void> {
  if (!ensureLoggedIn()) return;
  const provider = repoProvider;
  if (!provider) return;
  const name = await vscode.window.showInputBox({ prompt: 'Repository name', placeHolder: 'my-project' });
  if (!name) return;
  const priv = await vscode.window.showQuickPick(['Public', 'Private'], { placeHolder: 'Visibility' });
  if (!priv) return;
  try {
    const repo = await provider.createRepo({ name, private: priv === 'Private', autoInit: true });
    vscode.window.showInformationMessage(`✅ Created: ${repo.fullName}`);

    await bindWorkspaceToRepository(repo, { showMessage: true });
  } catch (e: any) { vscode.window.showErrorMessage(`Create failed: ${e.message}`); }
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
    const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Choose a repository', matchOnDescription: true });
    if (!picked) return;

    const linked = await bindWorkspaceToRepository(picked.repo, { showMessage: false });
    if (!linked) return;

    vscode.window.showInformationMessage(`✅ Switched and linked to: ${picked.repo.fullName}`);
    // ⭐ Refresh the status automatically
    vscode.commands.executeCommand('gitpilot.refreshStatus');
  } catch (e: any) { vscode.window.showErrorMessage(`Switch failed: ${e.message}`); }
}

async function handleRefreshRepos(): Promise<void> {
  if (!ensureLoggedIn()) return;
  try {
    const repos = await repoProvider!.listRepos();
    vscode.window.showInformationMessage(`Found ${repos.length} repository(ies)`);
  } catch (e: any) { vscode.window.showErrorMessage(`Refresh failed: ${e.message}`); }
}

// ⭐ One-click GitHub repository linking
async function handleLinkRepo(): Promise<void> {
  if (!ensureLoggedIn()) return;
  try {
    const repos = await repoProvider!.listRepos();
    if (repos.length === 0) {
      const create = await vscode.window.showInformationMessage(
        "You don't have any GitHub repository yet. Create one?",
        'Create repository',
      );
      if (create === 'Create repository') {
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
      placeHolder: 'Choose a GitHub repository to link',
      title: 'GitPilot · Link remote repository',
      matchOnDescription: true,
    });
    if (!picked) return;

    await bindWorkspaceToRepository(picked.repo, { showMessage: true });
  } catch (e: any) {
    vscode.window.showErrorMessage(`Link failed: ${e.message}`);
  }
}

// ⭐ Real status refresh (fetch the repository list from the GitHub API + local Git status)
async function handleRefreshStatus(): Promise<void> {
  if (!ensureLoggedIn()) {
    sidebarProvider.postMessage({ refreshState: 'error', statusText: 'Please sign in first', status: '❌ Not signed in' });
    return;
  }
  // Tell the sidebar to start the loading animation
  sidebarProvider.postMessage({ refreshState: 'start' });

  const timeoutMs = 10000; // 10 second timeout

  try {
    const result = await Promise.race([
      (async () => {
        // Actual refresh work: fetch the repository list + Git status
        const repos = await repoProvider!.listRepos();
        let gitStatusInfo = '';
        try {
          if (orchestrator) {
            const hasChanges = await orchestrator.hasPendingChanges();
            gitStatusInfo = hasChanges ? ' · undeployed changes' : ' · up to date';
          }
        } catch { /* git status is non-critical */ }

        return { repos, gitStatusInfo };
      })(),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error('TIMEOUT')), timeoutMs)
      ),
    ]);

    // Refresh succeeded
    const statusMsg = `Synced ${result.repos.length} repository(ies)${result.gitStatusInfo}`;
    sidebarProvider.postMessage({
      refreshState: 'done',
      statusText: statusMsg,
      status: '✅ Ready',
    });
  } catch (e: any) {
    // Timeout or error
    logger.error('Refresh error: ' + (e.message ?? String(e)));
    sidebarProvider.postMessage({
      refreshState: 'error',
      statusText: 'Error! Please check your network connection',
      status: '❌ Refresh failed',
    });
  }
}

async function handleConfigureBuild(): Promise<void> {
  const config = vscode.workspace.getConfiguration('gitpilot');
  const cmd = await vscode.window.showInputBox({
    prompt: 'Enter the build command (no language guessing — you write it)',
    placeHolder: 'npm run build / cargo build --release / ...',
    value: config.get<string>('build.command') ?? '',
  });
  if (cmd === undefined) return;
  const beforeDeploy = await vscode.window.showQuickPick(['Yes', 'No'], { placeHolder: 'Run Build before deploy?' });
  const blockOnFail = await vscode.window.showQuickPick(['Yes', 'No'], { placeHolder: 'Block the deploy when Build fails?' });
  await config.update('build.command', cmd, vscode.ConfigurationTarget.Workspace);
  await config.update('build.beforeDeploy', beforeDeploy === 'Yes', vscode.ConfigurationTarget.Workspace);
  await config.update('build.blockOnFailure', blockOnFail === 'Yes', vscode.ConfigurationTarget.Workspace);
  vscode.window.showInformationMessage('✅ Build configuration updated');
}

async function configureGitAuthorIdentity(): Promise<void> {
  const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!wsRoot) {
    vscode.window.showErrorMessage('No workspace is open');
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
    prompt: 'Enter the Git commit user name',
    value: current.name,
    ignoreFocusOut: true,
  });
  if (!name) return;

  const email = await vscode.window.showInputBox({
    prompt: 'Enter the Git commit email',
    value: current.email,
    ignoreFocusOut: true,
  });
  if (!email) return;

  activeGitAuthorName = name;
  activeGitAuthorEmail = email;
  await gitProvider.ensureAuthorIdentity(name, email, true);
  vscode.window.showInformationMessage('Git author identity configured');
}

function stripErrorPrefix(error: string, prefix: string): string {
  const index = error.indexOf(prefix);
  return index >= 0 ? error.slice(index + prefix.length) : error;
}

// ---- Deploy result presentation ----
async function showDeployResult(result: DeployResult): Promise<void> {
  if (result.success && result.status === 'no-changes') return;
  if (result.success) {
    // ⭐ Extract the staged file count from the steps
    const stageStep = result.steps?.find((s: any) => s.name === 'Staging files');
    const fileInfo = stageStep?.details ? ` · ${stageStep.details}` : '';

    const actionId = await notifier.show({
      type: 'success', title: '🚀 Deployed!',
      message: `Commit: ${result.commitHash?.substring(0, 7) ?? '--'}${fileInfo} · took ${(result.totalDurationMs / 1000).toFixed(1)}s`,
      actions: [
        { label: 'View on GitHub', id: 'open-repo' },
        ...(result.releaseUrl ? [{ label: 'View Release', id: 'open-release' }] : []),
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
      displayMsg = 'The local repository is not linked to a GitHub remote';
    } else if (isGitNotFound) {
      displayMsg = stripErrorPrefix(errorText, GIT_NOT_FOUND_PREFIX);
    } else if (isNotGitRepo) {
      displayMsg = stripErrorPrefix(errorText, NOT_GIT_REPO_PREFIX);
    } else if (isAuthorMissing) {
      displayMsg = stripErrorPrefix(errorText, GIT_AUTHOR_MISSING_PREFIX);
    } else if (isNetworkError) {
      // ⭐ Network error → extract the friendly message (strip the prefix)
      displayMsg = errorText.replace(/^.*?(NETWORK_\w+:)/, '').replace(/^NETWORK_\w+:/, '');
    } else {
      displayMsg = errorText || 'Unknown error';
    }

    const actions: { label: string; id: string }[] = [];
    if (isOriginMissing || isNotGitRepo) {
      actions.push({ label: 'Create repository and link', id: 'create-repo' });
      actions.push({ label: '🔗 Link repository', id: 'link-repo' });
    }
    if (isAuthorMissing) actions.push({ label: 'Configure Git author', id: 'configure-author' });
    if (isNetworkError) actions.push({ label: '⏳ Retry in 3s', id: 'retry-delayed' });
    actions.push({ label: 'Retry', id: 'retry' });

    const actionId = await notifier.show({
      type: 'error', title: '❌ Deploy failed',
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
      // ⭐ Network error: wait 3 seconds before retrying
      vscode.window.showInformationMessage('⏳ Retrying automatically in 3 seconds...');
      await new Promise(r => setTimeout(r, 3000));
      vscode.commands.executeCommand('gitpilot.deploy');
    } else if (actionId === 'retry') {
      vscode.commands.executeCommand('gitpilot.deploy');
    }
  }
}

// ⭐ Open the given URL in a browser (Edge first → Chrome → error)
async function openUrlInBrowser(url: string): Promise<void> {
  const { exec } = require('child_process');
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  // Detect Edge paths
  const edgePaths = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  // Detect Chrome paths
  const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
  const chromePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(localAppData, 'Google\\Chrome\\Application\\chrome.exe'),
  ];

  let browserPath: string | null = null;
  let browserName = '';

  // Edge first
  for (const p of edgePaths) {
    if (fs.existsSync(p)) { browserPath = p; browserName = 'Edge'; break; }
  }
  // Then Chrome
  if (!browserPath) {
    for (const p of chromePaths) {
      if (fs.existsSync(p)) { browserPath = p; browserName = 'Chrome'; break; }
    }
  }

  if (!browserPath) {
    vscode.window.showErrorMessage(
      'Your browser does not appear to be supported. Please use a supported browser (e.g. Edge or Google Chrome).',
    );
    return;
  }

  return new Promise((resolve) => {
    exec(`start "" "${browserPath}" "${url}"`, { timeout: 5000 }, (err: any) => {
      if (err) {
        // Fall back to VS Code's built-in open method
        vscode.env.openExternal(vscode.Uri.parse(url));
      }
      resolve();
    });
  });
}

// ⭐ Open the GitHub page of the current repository
async function openRepoInBrowser(): Promise<void> {
  // Try to get the URL from the git remote
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
    vscode.window.showErrorMessage('Unable to get the repository URL. Please open GitHub manually.');
    return;
  }

  await openUrlInBrowser(repoUrl);
}

// ---- Initialize the Orchestrator ----
async function initOrchestrator(): Promise<void> {
  if (!repoProvider || !releaseProvider) {
    logger.warn('GitHub Provider is not initialized; please sign in first');
    return;
  }
  const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!wsRoot) { logger.warn('No workspace is open'); return; }

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

  // ⭐ Smart branch detection: check the current branch first; on failure fall back to the first local branch
  let branch = 'main';
  try {
    const b = await gitProvider.getCurrentBranch();
    if (b && b !== 'HEAD') branch = b;
  } catch {
    // getCurrentBranch failed, try the fallback
    try {
      const status = await gitProvider.getStatus();
      if (status.currentBranch && status.currentBranch !== 'HEAD' && status.currentBranch !== 'unknown') {
        branch = status.currentBranch;
      }
    } catch { /* keep main as the default */ }
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

  // ⭐ Update the sidebar repository info
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

// ---- Automatic session restore ----
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
  logger.info('Session restored');
  // Fetch the user name for the sidebar display
  try {
    const user = await authProvider.getUserInfo(token);
    setActiveGitAuthor(user);
    sidebarProvider.setLoggedIn(user.login, user.avatarUrl ?? undefined);
  } catch {
    sidebarProvider.setLoggedIn('GitHub');
  }
}

// ---- Auto deploy triggers ----
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
      // ⭐ No pre-checks; let the orchestrator handle every situation internally (including unpushed-commit detection)
      if (orchestrator) await orchestrator.deploy();
    }, interval);
  }
}

// ---- Helper functions ----
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
