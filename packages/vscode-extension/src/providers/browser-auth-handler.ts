// ============================================================
// BrowserAuthHandler — 浏览器选择 + OAuth 登录流程
//
// 1. 自动检测系统已安装的主流浏览器
// 2. 弹出 QuickPick 让用户选择浏览器
// 3. 启动本地 HTTP 服务器接收 OAuth 回调
// 4. 用选中的浏览器打开 GitHub 授权页面
// 5. 接收授权码并返回
// ============================================================

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import * as vscode from 'vscode';

// ---- 类型定义 ----

/** 浏览器信息 */
export interface BrowserInfo {
  name: string;       // 显示名称
  key: string;        // 唯一标识
  emoji: string;      // 图标 emoji
  exePath: string;    // 可执行文件路径
}

/** OAuth 流程结果 */
export interface OAuthResult {
  code: string;
  state?: string;
}

// ---- 浏览器检测 ----

/** 检测 Windows 上已安装的主流浏览器 */
function detectWindowsBrowsers(): BrowserInfo[] {
  const home = os.homedir();
  const localAppData = process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local');

  // 定义候选浏览器列表（按优先级排列）
  const candidates: { name: string; key: string; emoji: string; paths: string[] }[] = [
    {
      name: 'Google Chrome',
      key: 'chrome',
      emoji: '🌐',
      paths: [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(localAppData, 'Google\\Chrome\\Application\\chrome.exe'),
      ],
    },
    {
      name: 'Microsoft Edge',
      key: 'edge',
      emoji: '🟦',
      paths: [
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      ],
    },
    {
      name: 'Firefox',
      key: 'firefox',
      emoji: '🦊',
      paths: [
        'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
        'C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe',
      ],
    },
    {
      name: 'Brave',
      key: 'brave',
      emoji: '🦁',
      paths: [
        'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
        path.join(localAppData, 'BraveSoftware\\Brave-Browser\\Application\\brave.exe'),
      ],
    },
    {
      name: 'Opera',
      key: 'opera',
      emoji: '🔴',
      paths: [
        path.join(localAppData, 'Programs\\Opera\\opera.exe'),
        'C:\\Program Files\\Opera\\opera.exe',
      ],
    },
    {
      name: 'Vivaldi',
      key: 'vivaldi',
      emoji: '🟥',
      paths: [
        path.join(localAppData, 'Vivaldi\\Application\\vivaldi.exe'),
        'C:\\Program Files\\Vivaldi\\Application\\vivaldi.exe',
      ],
    },
  ];

  const found: BrowserInfo[] = [];

  for (const c of candidates) {
    for (const p of c.paths) {
      if (fs.existsSync(p)) {
        found.push({ name: c.name, key: c.key, emoji: c.emoji, exePath: p });
        break; // 找到第一个可用路径即停止
      }
    }
  }

  return found;
}

/** 检测 macOS 上已安装的浏览器 */
function detectMacBrowsers(): BrowserInfo[] {
  const candidates: { name: string; key: string; emoji: string; paths: string[] }[] = [
    {
      name: 'Google Chrome',
      key: 'chrome',
      emoji: '🌐',
      paths: ['/Applications/Google Chrome.app'],
    },
    {
      name: 'Microsoft Edge',
      key: 'edge',
      emoji: '🟦',
      paths: ['/Applications/Microsoft Edge.app'],
    },
    {
      name: 'Firefox',
      key: 'firefox',
      emoji: '🦊',
      paths: ['/Applications/Firefox.app'],
    },
    {
      name: 'Safari',
      key: 'safari',
      emoji: '🧭',
      paths: ['/Applications/Safari.app'],
    },
    {
      name: 'Brave',
      key: 'brave',
      emoji: '🦁',
      paths: ['/Applications/Brave Browser.app'],
    },
    {
      name: 'Opera',
      key: 'opera',
      emoji: '🔴',
      paths: ['/Applications/Opera.app'],
    },
  ];

  const found: BrowserInfo[] = [];
  for (const c of candidates) {
    for (const p of c.paths) {
      if (fs.existsSync(p)) {
        found.push({ name: c.name, key: c.key, emoji: c.emoji, exePath: p });
        break;
      }
    }
  }
  return found;
}

/** 检测 Linux 上已安装的浏览器 */
function detectLinuxBrowsers(): BrowserInfo[] {
  const candidates: { name: string; key: string; emoji: string; commands: string[] }[] = [
    { name: 'Google Chrome', key: 'chrome', emoji: '🌐', commands: ['google-chrome', 'google-chrome-stable', 'chromium-browser', 'chromium'] },
    { name: 'Microsoft Edge', key: 'edge', emoji: '🟦', commands: ['microsoft-edge', 'microsoft-edge-stable'] },
    { name: 'Firefox', key: 'firefox', emoji: '🦊', commands: ['firefox'] },
    { name: 'Brave', key: 'brave', emoji: '🦁', commands: ['brave-browser', 'brave'] },
    { name: 'Opera', key: 'opera', emoji: '🔴', commands: ['opera'] },
  ];

  const found: BrowserInfo[] = [];
  // 使用 which 查找可执行文件
  for (const c of candidates) {
    for (const cmd of c.commands) {
      try {
        const result = require('child_process').execSync(`which ${cmd} 2>/dev/null`, { encoding: 'utf-8' }).trim();
        if (result) {
          found.push({ name: c.name, key: c.key, emoji: c.emoji, exePath: result });
          break;
        }
      } catch { /* 未找到 */ }
    }
  }
  return found;
}

/** 统一检测入口 */
export function detectBrowsers(): BrowserInfo[] {
  const platform = os.platform();
  if (platform === 'win32') {
    return detectWindowsBrowsers();
  } else if (platform === 'darwin') {
    return detectMacBrowsers();
  } else {
    return detectLinuxBrowsers();
  }
}

// ---- OAuth 本地服务器 ----

/** 在随机可用端口启动本地 HTTP 服务器，返回 { server, port, codePromise } */
function startOAuthServer(): Promise<{
  server: http.Server;
  port: number;
  codePromise: Promise<string>;
}> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    let codeResolve!: (code: string) => void;
    let codeReject!: (err: Error) => void;

    const codePromise = new Promise<string>((res, rej) => {
      codeResolve = res;
      codeReject = rej;
    });

    server.on('error', (err) => {
      codeReject(err);
      reject(err);
    });

    server.on('request', (req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost:${(server.address() as any)?.port ?? 0}`);

      if (url.pathname === '/callback' || url.pathname === '/') {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        if (code) {
          // 成功获取授权码 → 返回成功页面
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>GitPilot · 授权成功</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:linear-gradient(135deg,#0d1117 0%,#161b22 100%);color:#c9d1d9}
  .card{text-align:center;padding:40px;background:#21262d;border:1px solid #30363d;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.4)}
  .icon{font-size:64px;margin-bottom:16px}
  h1{font-size:22px;color:#58a6ff;margin-bottom:8px}
  p{font-size:14px;color:#8b949e}
  .check{color:#3fb950;font-size:48px;margin-bottom:12px}
</style></head>
<body>
  <div class="card">
    <div class="check">✓</div>
    <h1>授权成功！</h1>
    <p>您可以关闭此页面，返回 VS Code 继续使用 GitPilot。</p>
  </div>
</body>
</html>`);

          codeResolve(code);

          // 1 秒后关闭服务器
          setTimeout(() => {
            server.close();
          }, 1000);
        } else if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<html><body><h1>授权失败</h1><p>${error}</p></body></html>`);
          codeReject(new Error(`OAuth error: ${error}`));
        } else {
          // 不是 OAuth 回调，返回提示
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<html><body><h1>GitPilot OAuth</h1><p>等待授权回调...</p></body></html>`);
        }
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    // 监听随机端口
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        resolve({ server, port: addr.port, codePromise });
      } else {
        reject(new Error('无法获取服务器端口'));
      }
    });
  });
}

// ---- 打开浏览器 ----

/** 用指定浏览器打开 URL */
function openWithBrowser(browserPath: string, url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const platform = os.platform();

    let command: string;
    if (platform === 'darwin') {
      // macOS: open -a "AppName" "url"
      command = `open -a "${browserPath}" "${url}"`;
    } else if (platform === 'win32') {
      // Windows: 直接用 exe 路径
      command = `start "" "${browserPath}" "${url}"`;
    } else {
      // Linux
      command = `"${browserPath}" "${url}"`;
    }

    exec(command, { timeout: 5000 }, (err) => {
      if (err) {
        reject(new Error(`无法打开浏览器: ${err.message}`));
      } else {
        resolve();
      }
    });
  });
}

// ---- 主流程 ----

/** 弹出浏览器选择面板（QuickPick）
 * @returns BrowserInfo — 用户选择的浏览器
 * @returns null — 用户选择了"系统默认浏览器"
 * @returns undefined — 用户取消了选择
 */
export async function promptBrowserSelection(): Promise<BrowserInfo | null | undefined> {
  const browsers = detectBrowsers();

  if (browsers.length === 0) {
    vscode.window.showWarningMessage('⚠️ 未检测到已安装的浏览器，将使用系统默认浏览器打开。');
    return null;
  }

  // 构建 QuickPick 选项
  const items: (vscode.QuickPickItem & { browser?: BrowserInfo; isDefault?: boolean })[] = browsers.map((b) => ({
    label: `${b.emoji}  ${b.name}`,
    description: b.exePath,
    detail: `使用 ${b.name} 打开 GitHub 授权页面`,
    browser: b,
  }));

  // 添加「使用系统默认浏览器」选项
  items.push({
    label: '🌍  系统默认浏览器',
    description: '使用操作系统默认浏览器',
    detail: '自动选择系统默认浏览器打开授权页面',
    isDefault: true,
  });

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: '🔐 选择用于 GitHub 登录的浏览器',
    title: 'GitPilot · 浏览器选择',
    matchOnDescription: true,
    matchOnDetail: false,
  });

  if (!picked) return undefined;            // 用户取消
  if (picked.isDefault) return null;         // 系统默认浏览器
  return picked.browser!;                    // 具体浏览器
}

/**
 * 执行完整的浏览器 OAuth 登录流程：
 * 1. 启动本地 OAuth 回调服务器
 * 2. 用选中浏览器打开 GitHub 授权页面
 * 3. 等待用户完成授权
 * 4. 返回授权码
 *
 * @param authUrl  GitHub OAuth 授权 URL
 * @param browser  用户选择的浏览器（null = 系统默认）
 * @param timeoutMs 超时时间（毫秒）
 * @returns 授权码
 */
export async function performBrowserOAuth(
  authUrl: string,
  browser: BrowserInfo | null,
  timeoutMs: number = 120_000, // 2 分钟超时
): Promise<string> {
  // 1. 启动本地回调服务器
  const { server, port, codePromise } = await startOAuthServer();

  // 2. 将回调 URL 的端口替换为实际端口
  const finalAuthUrl = authUrl.replace(/redirect_uri=([^&]+)/, (_, uri) => {
    const decoded = decodeURIComponent(uri);
    const newUri = decoded.replace(/localhost:\d+/, `localhost:${port}`);
    return `redirect_uri=${encodeURIComponent(newUri)}`;
  });

  try {
    // 3. 打开浏览器
    if (browser) {
      await openWithBrowser(browser.exePath, finalAuthUrl);
    } else {
      // 系统默认浏览器 → 使用 vscode.env.openExternal
      await vscode.env.openExternal(vscode.Uri.parse(finalAuthUrl));
    }

    // 4. 显示进度提示
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: '⏳ 等待 GitHub 授权...',
        cancellable: true,
      },
      async (progress, cancelToken) => {
        // 超时 + 取消 竞态
        const timeoutPromise = new Promise<string>((_, rej) => {
          setTimeout(() => rej(new Error('授权超时（2分钟），请重试')), timeoutMs);
        });

        const cancelPromise = new Promise<string>((_, rej) => {
          cancelToken.onCancellationRequested(() => {
            rej(new Error('用户取消授权'));
          });
        });

        // 等待第一个完成的结果
        await Promise.race([codePromise, timeoutPromise, cancelPromise]);
      },
    );

    // 如果执行到这里但没有拿到 code（理论上 codePromise 已 resolve），等待 code
    const code = await codePromise;
    return code;
  } finally {
    // 确保服务器关闭
    server.close();
  }
}
