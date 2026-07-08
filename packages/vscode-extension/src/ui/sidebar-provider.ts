// GitPilot Sidebar - Webview Provider
// ============================================================
import * as vscode from 'vscode';

export class SidebarProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _isLoggedIn = false;
  private _loginName = 'CyanQX';
  private _repoName = 'CyanQX/GitPilot_main';
  private _buildCmd = '';
  private _status = '就绪';
  private _statusText = '已同步 5 个仓库';
  private _avatarUrl = 'https://github.com/CyanQX.png?size=96';

  constructor(private readonly _extensionUri: vscode.Uri) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
    };
    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage((msg) => {
      switch (msg.command) {
        case 'deploy': vscode.commands.executeCommand('gitpilot.deploy'); break;
        case 'sync': vscode.commands.executeCommand('gitpilot.sync'); break;
        case 'login': vscode.commands.executeCommand('gitpilot.login'); break;
        case 'logout': vscode.commands.executeCommand('gitpilot.logout'); break;
        case 'createRepo': vscode.commands.executeCommand('gitpilot.createRepo'); break;
        case 'switchRepo': vscode.commands.executeCommand('gitpilot.switchRepo'); break;
        case 'refreshRepos': vscode.commands.executeCommand('gitpilot.refreshStatus'); break;
        case 'configureBuild': vscode.commands.executeCommand('gitpilot.configureBuild'); break;
        case 'openGitHub': vscode.commands.executeCommand('gitpilot.openOnGitHub'); break;
        case 'getState':
          this._pushState();
          break;
      }
    });

    this._pushState();
  }

  refresh(): void {
    if (!this._view) return;
    this._view.webview.html = this.getHtml();
    setTimeout(() => this._pushState(), 100);
  }

  private _pushState(): void {
    if (!this._view) return;
    this._view.webview.postMessage({
      loggedIn: this._isLoggedIn,
      loginName: this._loginName,
      avatarUrl: this._avatarUrl,
      repoName: this._repoName,
      buildCmd: this._buildCmd,
      status: this._status,
      statusText: this._statusText,
    });
  }

  setLoggedIn(login: string, avatarUrl?: string): void {
    this._isLoggedIn = true;
    this._loginName = login || 'CyanQX';
    this._avatarUrl = avatarUrl || 'https://github.com/CyanQX.png?size=96';
    this._status = '就绪';
    this._statusText = this._statusText || '已同步 5 个仓库';
    this._pushState();
  }

  setLoggedOut(): void {
    this._isLoggedIn = false;
    this._status = '未登录';
    this._statusText = '请先绑定 GitHub 账号';
    this._pushState();
  }

  setRepoName(name: string): void {
    this._repoName = name || 'CyanQX/GitPilot_main';
    this._pushState();
  }

  setBuildCmd(cmd: string): void {
    this._buildCmd = cmd;
    this._pushState();
  }

  setStatus(status: string, statusText?: string): void {
    this._status = status;
    if (statusText !== undefined) this._statusText = statusText;
    this._pushState();
  }

  postMessage(msg: any): void {
    if (msg.loggedIn !== undefined) this._isLoggedIn = Boolean(msg.loggedIn);
    if (msg.loginName !== undefined) this._loginName = msg.loginName || 'CyanQX';
    if (msg.avatarUrl !== undefined) this._avatarUrl = msg.avatarUrl || 'https://github.com/CyanQX.png?size=96';
    if (msg.repoName !== undefined) this._repoName = msg.repoName || 'CyanQX/GitPilot_main';
    if (msg.buildCmd !== undefined) this._buildCmd = msg.buildCmd || '';
    if (msg.status !== undefined) this._status = msg.status || '就绪';
    if (msg.statusText !== undefined) this._statusText = msg.statusText || '已同步 5 个仓库';

    this._view?.webview.postMessage(msg);
  }

  private getHtml(): string {
    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}';">
<style nonce="${nonce}">
  :root {
    --gp-bg: #f6f8fb;
    --gp-card: #ffffff;
    --gp-card-soft: rgba(255, 255, 255, 0.82);
    --gp-text: #101828;
    --gp-muted: #667085;
    --gp-subtle: #98a2b3;
    --gp-border: #e4e9f2;
    --gp-border-strong: #d6deeb;
    --gp-purple: #6847e8;
    --gp-purple-2: #7a5cf5;
    --gp-blue: #2474e8;
    --gp-green: #12b76a;
    --gp-red: #f04438;
    --gp-shadow: 0 16px 42px rgba(16, 24, 40, 0.08);
    --gp-shadow-soft: 0 10px 26px rgba(16, 24, 40, 0.06);
    --gp-radius: 18px;
    --gp-radius-sm: 14px;
  }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    min-height: 100vh;
    color: var(--gp-text);
    background:
      radial-gradient(circle at 18% 0%, rgba(104, 71, 232, 0.08), transparent 28%),
      linear-gradient(180deg, #fbfcff 0%, var(--gp-bg) 48%, #f4f7fb 100%);
    font-family: var(--vscode-font-family, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
    font-size: 14px;
    line-height: 1.45;
  }

  button {
    font: inherit;
    appearance: none;
    -webkit-appearance: none;
  }

  .dashboard-shell {
    width: 100%;
    min-height: 100vh;
    padding: 24px;
  }

  .dashboard {
    width: min(1180px, 100%);
    margin: 0 auto;
    display: grid;
    gap: 20px;
  }

  .card {
    background: var(--gp-card);
    border: 1px solid rgba(214, 222, 235, 0.9);
    border-radius: var(--gp-radius);
    box-shadow: var(--gp-shadow-soft);
  }

  .account-card,
  .repo-card,
  .settings-card,
  .create-card,
  .status-card {
    padding: 24px;
  }

  .account-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    min-height: 124px;
  }

  .account-main {
    display: flex;
    align-items: center;
    gap: 20px;
    min-width: 0;
  }

  .avatar {
    position: relative;
    width: 72px;
    height: 72px;
    flex: 0 0 72px;
    border-radius: 50%;
    background: linear-gradient(145deg, #eef3ff, #ffffff);
    box-shadow: inset 0 0 0 1px #e6ecf6, 0 10px 24px rgba(16, 24, 40, 0.08);
    overflow: visible;
  }

  .avatar img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
    border-radius: inherit;
  }

  .avatar-fallback {
    width: 100%;
    height: 100%;
    display: none;
    place-items: center;
    border-radius: inherit;
    color: var(--gp-purple);
    font-size: 28px;
    font-weight: 800;
    background: #f0edff;
  }

  .avatar-status {
    position: absolute;
    right: 2px;
    bottom: 3px;
    width: 15px;
    height: 15px;
    border: 3px solid #fff;
    border-radius: 50%;
    background: #00c48c;
  }

  .eyebrow {
    margin: 0 0 4px;
    color: var(--gp-muted);
    font-size: 13px;
    font-weight: 700;
  }

  .title-lg {
    margin: 0;
    color: #111827;
    font-size: clamp(24px, 2.2vw, 36px);
    line-height: 1.1;
    font-weight: 850;
    letter-spacing: 0;
    overflow-wrap: anywhere;
  }

  .title-md {
    margin: 0;
    color: #111827;
    font-size: 20px;
    line-height: 1.2;
    font-weight: 800;
  }

  .description {
    margin: 6px 0 0;
    color: var(--gp-muted);
    font-size: 14px;
  }

  .status-line {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
    color: var(--gp-muted);
    font-size: 16px;
  }

  .check-ring,
  .status-dot-icon {
    display: inline-grid;
    place-items: center;
    flex: 0 0 auto;
    color: var(--gp-green);
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
    min-height: 44px;
    padding: 0 18px;
    border: 1px solid transparent;
    border-radius: 12px;
    cursor: pointer;
    font-weight: 750;
    transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease, background 0.18s ease, color 0.18s ease;
    white-space: nowrap;
  }

  .btn:hover {
    transform: translateY(-1px);
  }

  .btn:active {
    transform: translateY(0);
  }

  .btn-danger {
    color: var(--gp-red);
    border-color: rgba(240, 68, 56, 0.28);
    background: rgba(255, 245, 245, 0.9);
    box-shadow: 0 10px 20px rgba(240, 68, 56, 0.08);
  }

  .btn-danger:hover {
    border-color: rgba(240, 68, 56, 0.45);
    background: #fff8f8;
  }

  .repo-card {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 24px;
    min-height: 156px;
  }

  .icon-bubble {
    width: 82px;
    height: 82px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--gp-purple);
    background: #f0edff;
  }

  .repo-actions {
    display: flex;
    align-items: stretch;
    gap: 16px;
  }

  .repo-action {
    min-width: 114px;
    padding: 12px 14px;
    color: #344054;
    background: transparent;
    border: 0;
    border-radius: 14px;
    cursor: pointer;
    transition: background 0.18s ease, transform 0.18s ease;
  }

  .repo-action:hover {
    background: #f5f7fb;
    transform: translateY(-1px);
  }

  .repo-action-icon {
    width: 50px;
    height: 50px;
    margin: 0 auto 8px;
    display: grid;
    place-items: center;
    color: #111827;
    border-radius: 16px;
    background: #fbfcff;
    box-shadow: 0 8px 22px rgba(16, 24, 40, 0.05);
  }

  .repo-action span {
    display: block;
    font-size: 13px;
    font-weight: 700;
  }

  .repo-divider {
    width: 1px;
    background: var(--gp-border);
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    width: fit-content;
    margin-top: 12px;
    padding: 6px 10px;
    border-radius: 10px;
    color: var(--gp-purple);
    background: #f1efff;
    font-size: 13px;
    font-weight: 750;
  }

  .actions-grid {
    display: grid;
    grid-template-columns: minmax(0, 2.05fr) minmax(280px, 1fr);
    gap: 20px;
  }

  .deploy-card {
    position: relative;
    min-height: 148px;
    padding: 30px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 24px;
    overflow: hidden;
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.28);
    border-radius: var(--gp-radius);
    background:
      linear-gradient(135deg, rgba(255, 255, 255, 0.14), transparent 36%),
      linear-gradient(135deg, #7c5df4 0%, #6144dd 48%, #5332c8 100%);
    box-shadow: 0 18px 38px rgba(91, 61, 206, 0.28);
  }

  .deploy-card::after {
    content: "";
    position: absolute;
    right: -50px;
    top: -72px;
    width: 210px;
    height: 210px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.13);
  }

  .deploy-icon {
    position: relative;
    z-index: 1;
    width: 82px;
    height: 82px;
    display: grid;
    place-items: center;
    border-radius: 24px;
    color: #fff;
    background: rgba(255, 255, 255, 0.16);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.18);
  }

  .deploy-copy,
  .deploy-cta {
    position: relative;
    z-index: 1;
  }

  .deploy-title {
    margin: 0;
    font-size: 24px;
    line-height: 1.2;
    font-weight: 850;
  }

  .deploy-desc {
    margin: 8px 0 0;
    color: rgba(255, 255, 255, 0.76);
    font-size: 15px;
  }

  .btn-deploy {
    min-width: 176px;
    min-height: 58px;
    color: var(--gp-purple);
    background: #fff;
    border-color: rgba(255, 255, 255, 0.58);
    border-radius: 13px;
    box-shadow: 0 16px 30px rgba(46, 27, 129, 0.2);
    font-size: 17px;
  }

  .btn-deploy:hover {
    box-shadow: 0 18px 34px rgba(46, 27, 129, 0.26);
  }

  .sync-card {
    min-height: 148px;
    padding: 26px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 18px;
    cursor: pointer;
    transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
    text-align: left;
  }

  .sync-card:hover {
    transform: translateY(-2px);
    border-color: #cdd9eb;
    box-shadow: var(--gp-shadow);
  }

  .sync-icon {
    width: 70px;
    height: 70px;
    display: grid;
    place-items: center;
    color: var(--gp-blue);
    border-radius: 50%;
    background: #eef5ff;
  }

  .sync-card .title-md,
  .sync-card .description {
    display: block;
  }

  .chevron {
    color: #344054;
  }

  .settings-card,
  .create-card {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 22px;
    min-height: 126px;
  }

  .settings-icon {
    color: #0f3d45;
    background: #e8f8ef;
  }

  .create-icon {
    width: 64px;
    height: 64px;
    display: grid;
    place-items: center;
    border-radius: 14px;
    color: var(--gp-purple);
    border: 2px dashed #c8d4ff;
    background: #fbfcff;
  }

  .btn-secondary {
    color: #344054;
    background: #fff;
    border-color: var(--gp-border-strong);
    box-shadow: 0 8px 20px rgba(16, 24, 40, 0.04);
  }

  .btn-secondary:hover {
    border-color: #bdc8d8;
    background: #fbfcff;
  }

  .btn-purple {
    color: var(--gp-purple);
    background: #fbfaff;
    border-color: #cabdff;
  }

  .btn-purple:hover {
    background: #f5f2ff;
    border-color: #ad9aff;
  }

  .build-state {
    margin-top: 6px;
    color: #344054;
    font-weight: 800;
  }

  .status-card {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 1px minmax(0, 1fr);
    align-items: center;
    gap: 26px;
    min-height: 96px;
  }

  .status-item {
    display: flex;
    align-items: center;
    gap: 16px;
    min-width: 0;
  }

  .status-medal {
    width: 46px;
    height: 46px;
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    color: #fff;
    border-radius: 50%;
    background: linear-gradient(135deg, #16b364, #039855);
    box-shadow: 0 12px 24px rgba(3, 152, 85, 0.18);
  }

  .status-title {
    margin: 0;
    font-size: 18px;
    font-weight: 850;
  }

  .status-desc {
    margin: 3px 0 0;
    color: var(--gp-muted);
    font-size: 13px;
  }

  .status-separator {
    height: 52px;
    background: var(--gp-border);
  }

  .logged-out {
    min-height: calc(100vh - 48px);
    display: grid;
    place-items: center;
  }

  .login-card {
    width: min(520px, 100%);
    padding: 34px;
    text-align: center;
  }

  .login-card .icon-bubble {
    margin: 0 auto 18px;
  }

  .login-card .btn {
    margin-top: 22px;
    width: 100%;
  }

  .hidden {
    display: none !important;
  }

  svg {
    width: 1.25em;
    height: 1.25em;
    display: block;
  }

  .icon-lg {
    width: 34px;
    height: 34px;
  }

  .icon-xl {
    width: 46px;
    height: 46px;
  }

  @media (max-width: 900px) {
    .dashboard-shell {
      padding: 20px;
    }

    .dashboard {
      gap: 18px;
    }

    .account-card,
    .repo-card,
    .settings-card,
    .create-card,
    .status-card {
      padding: 18px;
    }

    .account-card {
      min-height: 104px;
    }

    .avatar {
      width: 58px;
      height: 58px;
      flex-basis: 58px;
    }

    .account-main {
      gap: 16px;
    }

    .title-lg {
      font-size: clamp(24px, 3.2vw, 30px);
    }

    .status-line {
      font-size: 14px;
      margin-top: 6px;
    }

    .btn {
      min-height: 42px;
      padding: 0 15px;
      border-radius: 11px;
    }

    .repo-card {
      grid-template-columns: 58px minmax(0, 1fr) auto;
      gap: 18px;
      min-height: 126px;
    }

    .icon-bubble {
      width: 58px;
      height: 58px;
    }

    .repo-actions {
      gap: 10px;
    }

    .repo-action {
      min-width: 86px;
      padding: 8px 9px;
      border-radius: 12px;
    }

    .repo-action-icon {
      width: 40px;
      height: 40px;
      margin-bottom: 6px;
      border-radius: 13px;
    }

    .repo-action span {
      font-size: 12px;
    }

    .actions-grid {
      grid-template-columns: minmax(0, 1.42fr) minmax(220px, 0.82fr);
      gap: 16px;
    }

    .deploy-card {
      min-height: 126px;
      padding: 20px;
      grid-template-columns: 58px minmax(0, 1fr) auto;
      gap: 16px;
    }

    .deploy-card::after {
      width: 164px;
      height: 164px;
      right: -54px;
      top: -66px;
    }

    .deploy-icon {
      width: 58px;
      height: 58px;
      border-radius: 18px;
    }

    .deploy-title {
      font-size: 21px;
    }

    .deploy-desc {
      font-size: 13px;
    }

    .btn-deploy {
      min-width: 142px;
      min-height: 50px;
      font-size: 15px;
      padding: 0 15px;
    }

    .sync-card {
      min-height: 126px;
      padding: 20px;
      grid-template-columns: 54px minmax(0, 1fr) 18px;
      gap: 14px;
    }

    .sync-icon {
      width: 54px;
      height: 54px;
    }

    .title-md {
      font-size: 18px;
    }

    .description {
      font-size: 13px;
    }

    .settings-card,
    .create-card {
      min-height: 108px;
      grid-template-columns: 58px minmax(0, 1fr) auto;
      gap: 16px;
    }

    .create-icon {
      width: 54px;
      height: 54px;
    }

    .status-card {
      min-height: 84px;
      gap: 18px;
    }

    .status-medal {
      width: 38px;
      height: 38px;
    }

    .status-title {
      font-size: 16px;
    }
  }

  @media (max-width: 560px) {
    .dashboard-shell {
      padding: 14px;
    }

    .dashboard {
      gap: 14px;
    }

    .account-card,
    .repo-card,
    .settings-card,
    .create-card,
    .deploy-card,
    .sync-card,
    .status-card {
      padding: 16px;
    }

    .account-card {
      align-items: stretch;
      flex-direction: column;
    }

    .account-main {
      width: 100%;
    }

    .repo-card {
      grid-template-columns: 54px minmax(0, 1fr);
      align-items: center;
    }

    .repo-actions {
      grid-column: 1 / -1;
      width: 100%;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    .repo-divider,
    .status-separator {
      display: none;
    }

    .repo-action {
      width: 100%;
      min-width: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 9px;
      padding: 10px;
      background: #f8faff;
      border: 1px solid var(--gp-border);
    }

    .repo-action-icon {
      width: 28px;
      height: 28px;
      margin: 0;
      border-radius: 10px;
      background: #fff;
    }

    .actions-grid {
      grid-template-columns: 1fr;
    }

    .deploy-card {
      grid-template-columns: 50px minmax(0, 1fr);
      min-height: 0;
    }

    .deploy-icon {
      width: 50px;
      height: 50px;
    }

    .btn-deploy {
      grid-column: 1 / -1;
      width: 100%;
      min-height: 50px;
    }

    .sync-card {
      grid-template-columns: 46px minmax(0, 1fr) 18px;
      min-height: 92px;
    }

    .sync-icon {
      width: 46px;
      height: 46px;
    }

    .settings-card,
    .create-card {
      grid-template-columns: 50px minmax(0, 1fr);
      align-items: center;
    }

    .settings-card .btn,
    .create-card .btn {
      grid-column: 1 / -1;
      width: 100%;
    }

    .status-card {
      grid-template-columns: 1fr;
    }

    .btn,
    .btn-deploy {
      width: 100%;
    }
  }

  @media (max-width: 420px) {
    .dashboard-shell {
      padding: 10px;
    }

    .account-main,
    .status-item {
      gap: 12px;
    }

    .avatar {
      width: 58px;
      height: 58px;
      flex-basis: 58px;
    }

    .title-lg {
      font-size: 22px;
    }
  }
</style>
</head>
<body>
  <div id="panel-logged-out" class="logged-out">
    <section class="card login-card">
      <div class="icon-bubble">
        ${this.icon('github', 'icon-xl')}
      </div>
      <p class="eyebrow">GitPilot 控制台</p>
      <h1 class="title-lg">连接 GitHub 开始部署</h1>
      <p class="description">绑定账号后即可管理仓库、同步代码并一键部署。</p>
      <button class="btn btn-purple" id="btn-login">${this.icon('github')} Login with GitHub</button>
    </section>
  </div>

  <main id="panel-logged-in" class="dashboard-shell hidden">
    <div class="dashboard">
      <section class="card account-card">
        <div class="account-main">
          <div class="avatar">
            <img id="avatar-img" src="https://github.com/CyanQX.png?size=96" alt="">
            <div class="avatar-fallback" id="avatar-fallback">C</div>
            <span class="avatar-status"></span>
          </div>
          <div>
            <h1 class="title-lg" id="account-name">CyanQX</h1>
            <div class="status-line">
              <span class="check-ring">${this.icon('check-circle')}</span>
              <span id="account-desc">GitHub 账号已绑定</span>
            </div>
          </div>
        </div>
        <button class="btn btn-danger" id="btn-logout">${this.icon('logout')} 退出登录</button>
      </section>

      <section class="card repo-card">
        <div class="icon-bubble">${this.icon('folder', 'icon-xl')}</div>
        <div>
          <p class="eyebrow">当前仓库</p>
          <h2 class="title-lg" id="repo-name">CyanQX/GitPilot_main</h2>
          <div class="badge">${this.icon('github')} GitHub 仓库</div>
        </div>
        <div class="repo-actions">
          <button class="repo-action" id="btn-openGitHub" title="在 GitHub 打开">
            <span class="repo-action-icon">${this.icon('external')}</span>
            <span>在 GitHub 打开</span>
          </button>
          <div class="repo-divider"></div>
          <button class="repo-action" id="btn-switchRepo" title="切换仓库">
            <span class="repo-action-icon">${this.icon('switch')}</span>
            <span>切换仓库</span>
          </button>
        </div>
      </section>

      <section class="actions-grid">
        <div class="deploy-card">
          <div class="deploy-icon">${this.icon('rocket', 'icon-xl')}</div>
          <div class="deploy-copy">
            <h2 class="deploy-title">部署到服务器</h2>
            <p class="deploy-desc">构建并部署当前仓库的最新代码</p>
          </div>
          <button class="btn btn-deploy" id="btn-deploy">${this.icon('rocket')} 立即部署 ${this.icon('chevron')}</button>
        </div>

        <button class="card sync-card" id="btn-sync">
          <span class="sync-icon">${this.icon('sync', 'icon-lg')}</span>
          <span>
            <span class="title-md">同步仓库</span>
            <span class="description">拉取最新代码与仓库信息</span>
          </span>
          <span class="chevron">${this.icon('chevron')}</span>
        </button>
      </section>

      <section class="card settings-card">
        <div class="icon-bubble settings-icon">${this.icon('terminal', 'icon-lg')}</div>
        <div>
          <h2 class="title-md">构建命令</h2>
          <div class="build-state" id="build-cmd">未配置</div>
          <p class="description">配置构建命令以在部署时执行自定义构建流程</p>
        </div>
        <button class="btn btn-secondary" id="btn-configureBuild">${this.icon('settings')} 配置构建命令 ${this.icon('chevron')}</button>
      </section>

      <section class="card create-card">
        <div class="create-icon">${this.icon('plus', 'icon-lg')}</div>
        <div>
          <h2 class="title-md">创建仓库</h2>
          <p class="description">连接或导入新的 GitHub 仓库进行部署</p>
        </div>
        <button class="btn btn-purple" id="btn-createRepo">${this.icon('plus')} 创建新仓库</button>
      </section>

      <section class="card status-card">
        <div class="status-item">
          <div class="status-medal">${this.icon('check')}</div>
          <div>
            <h2 class="status-title" id="sync-status">已同步 5 个仓库</h2>
            <p class="status-desc" id="sync-subtext">所有仓库已是最新状态</p>
          </div>
        </div>
        <div class="status-separator"></div>
        <div class="status-item">
          <div class="status-medal">${this.icon('check-circle')}</div>
          <div>
            <h2 class="status-title" id="ready-status">就绪</h2>
            <p class="status-desc" id="ready-subtext">系统运行正常，可随时部署</p>
          </div>
        </div>
      </section>
    </div>
  </main>

<script nonce="${nonce}">
(function(){
  var vscode = acquireVsCodeApi();
  var state = {
    loggedIn: false,
    loginName: 'CyanQX',
    avatarUrl: 'https://github.com/CyanQX.png?size=96',
    repoName: 'CyanQX/GitPilot_main',
    buildCmd: '',
    status: '就绪',
    statusText: '已同步 5 个仓库',
    refreshState: ''
  };

  function send(cmd){ vscode.postMessage({ command: cmd }); }

  function bind(id, cmd){
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', function(){ send(cmd); });
  }

  bind('btn-login', 'login');
  bind('btn-deploy', 'deploy');
  bind('btn-sync', 'sync');
  bind('btn-logout', 'logout');
  bind('btn-switchRepo', 'switchRepo');
  bind('btn-openGitHub', 'openGitHub');
  bind('btn-createRepo', 'createRepo');
  bind('btn-configureBuild', 'configureBuild');

  function setText(id, value){
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function sanitizeStatus(value, fallback){
    var text = value || fallback;
    return String(text).replace(/[✅❌⏳]/g, '').trim() || fallback;
  }

  function renderLoggedIn(){
    document.getElementById('panel-logged-out').classList.add('hidden');
    document.getElementById('panel-logged-in').classList.remove('hidden');

    var loginName = state.loginName || 'CyanQX';
    var repoName = state.repoName || 'CyanQX/GitPilot_main';
    setText('account-name', loginName);
    setText('repo-name', repoName);
    setText('build-cmd', state.buildCmd && state.buildCmd.trim() ? state.buildCmd : '未配置');

    var avatarImg = document.getElementById('avatar-img');
    var avatarFallback = document.getElementById('avatar-fallback');
    avatarFallback.textContent = loginName.charAt(0).toUpperCase();
    avatarImg.onerror = function(){
      avatarImg.style.display = 'none';
      avatarFallback.style.display = 'grid';
    };
    avatarImg.onload = function(){
      avatarImg.style.display = 'block';
      avatarFallback.style.display = 'none';
    };
    avatarImg.src = state.avatarUrl || 'https://github.com/CyanQX.png?size=96';

    if (state.refreshState === 'start') {
      setText('sync-status', '正在同步仓库');
      setText('sync-subtext', '正在刷新最新仓库与代码状态');
      setText('ready-status', '刷新中');
      setText('ready-subtext', '请稍候，系统正在检查状态');
      return;
    }

    if (state.refreshState === 'error') {
      setText('sync-status', state.statusText || '刷新失败');
      setText('sync-subtext', '请检查网络或 GitHub 账号状态');
      setText('ready-status', sanitizeStatus(state.status, '需要处理'));
      setText('ready-subtext', '状态刷新未完成，建议稍后重试');
      return;
    }

    setText('sync-status', state.statusText || '已同步 5 个仓库');
    setText('sync-subtext', '所有仓库已是最新状态');
    setText('ready-status', sanitizeStatus(state.status, '就绪'));
    setText('ready-subtext', '系统运行正常，可随时部署');
  }

  function renderLoggedOut(){
    document.getElementById('panel-logged-out').classList.remove('hidden');
    document.getElementById('panel-logged-in').classList.add('hidden');
  }

  function render(){
    if (state.loggedIn) renderLoggedIn();
    else renderLoggedOut();
  }

  window.addEventListener('message', function(event){
    var msg = event.data || {};
    if (msg.loggedIn !== undefined) state.loggedIn = !!msg.loggedIn;
    if (msg.loginName !== undefined) state.loginName = msg.loginName || 'CyanQX';
    if (msg.avatarUrl !== undefined) state.avatarUrl = msg.avatarUrl || 'https://github.com/CyanQX.png?size=96';
    if (msg.repoName !== undefined) state.repoName = msg.repoName || 'CyanQX/GitPilot_main';
    if (msg.buildCmd !== undefined) state.buildCmd = msg.buildCmd || '';
    if (msg.status !== undefined) state.status = msg.status || '就绪';
    if (msg.statusText !== undefined) state.statusText = msg.statusText || '已同步 5 个仓库';
    if (msg.refreshState !== undefined) state.refreshState = msg.refreshState || '';
    render();
  });

  render();
  send('getState');
})();
</script>
</body>
</html>`;
  }

  private icon(name: string, className = ''): string {
    const cls = className ? ` class="${className}"` : '';
    const common = `xmlns="http://www.w3.org/2000/svg"${cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"`;
    const icons: Record<string, string> = {
      check: `<svg ${common}><path d="M20 6 9 17l-5-5"/></svg>`,
      'check-circle': `<svg ${common}><path d="M9 12l2 2 4-5"/><circle cx="12" cy="12" r="9"/></svg>`,
      chevron: `<svg ${common}><path d="m9 18 6-6-6-6"/></svg>`,
      external: `<svg ${common}><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>`,
      folder: `<svg ${common}><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z"/></svg>`,
      github: `<svg ${common}><path d="M15 22v-3.8a3.4 3.4 0 0 0-.9-2.6c3 0 6.1-1.5 6.1-6.6a5.1 5.1 0 0 0-1.4-3.6 4.8 4.8 0 0 0-.1-3.6s-1.1-.4-3.7 1.4a12.7 12.7 0 0 0-6.8 0C5.6.4 4.5.8 4.5.8a4.8 4.8 0 0 0-.1 3.6A5.1 5.1 0 0 0 3 8c0 5.1 3.1 6.6 6.1 6.6a3.4 3.4 0 0 0-.9 2.6V22"/><path d="M9 18c-4.5 2-4.5-2-6-2"/></svg>`,
      logout: `<svg ${common}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>`,
      plus: `<svg ${common}><path d="M12 5v14"/><path d="M5 12h14"/></svg>`,
      rocket: `<svg ${common}><path d="M4.5 16.5c-1.2 1.2-1.5 3-1.5 3s1.8-.3 3-1.5l11-11a4.2 4.2 0 0 0-6-6z"/><path d="M9 15 4 20"/><path d="m14 4 6 6"/><path d="M15 9h.01"/></svg>`,
      settings: `<svg ${common}><path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.3a2 2 0 1 1-4 0V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.2 17l.1-.1A1.7 1.7 0 0 0 4.6 15 1.7 1.7 0 0 0 3 14H2.7a2 2 0 1 1 0-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 1 1 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.7a2 2 0 1 1 4 0V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.3a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1z"/></svg>`,
      switch: `<svg ${common}><path d="m16 3 4 4-4 4"/><path d="M20 7H8a4 4 0 0 0-4 4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h12a4 4 0 0 0 4-4"/></svg>`,
      sync: `<svg ${common}><path d="M3 12a9 9 0 0 1 15.2-6.5L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.2 6.5L3 16"/><path d="M3 21v-5h5"/></svg>`,
      terminal: `<svg ${common}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m8 9 3 3-3 3"/><path d="M13 15h3"/></svg>`,
    };
    return icons[name] ?? icons.check;
  }

  private getNonce(): string {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let text = '';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
