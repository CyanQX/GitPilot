// ============================================================
// BrowserAuthHandler — browser selection + OAuth login flow
//
// 1. Automatically detect installed mainstream browsers
// 2. Show a QuickPick for the user to choose a browser
// 3. Start a local HTTP server to receive the OAuth callback
// 4. Open the GitHub authorization page in the selected browser
// 5. Receive the authorization code and return it
// ============================================================

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import * as vscode from 'vscode';

// ---- Type definitions ----

/** Browser information */
export interface BrowserInfo {
  name: string;       // display name
  key: string;        // unique identifier
  emoji: string;      // icon emoji
  exePath: string;    // executable path
}

/** OAuth flow result */
export interface OAuthResult {
  code: string;
  state?: string;
}

// ---- Browser detection ----

/** Detect installed mainstream browsers on Windows */
function detectWindowsBrowsers(): BrowserInfo[] {
  const home = os.homedir();
  const localAppData = process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local');

  // Candidate browser list (ordered by priority)
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
        break; // stop at the first usable path
      }
    }
  }

  return found;
}

/** Detect installed browsers on macOS */
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

/** Detect installed browsers on Linux */
function detectLinuxBrowsers(): BrowserInfo[] {
  const candidates: { name: string; key: string; emoji: string; commands: string[] }[] = [
    { name: 'Google Chrome', key: 'chrome', emoji: '🌐', commands: ['google-chrome', 'google-chrome-stable', 'chromium-browser', 'chromium'] },
    { name: 'Microsoft Edge', key: 'edge', emoji: '🟦', commands: ['microsoft-edge', 'microsoft-edge-stable'] },
    { name: 'Firefox', key: 'firefox', emoji: '🦊', commands: ['firefox'] },
    { name: 'Brave', key: 'brave', emoji: '🦁', commands: ['brave-browser', 'brave'] },
    { name: 'Opera', key: 'opera', emoji: '🔴', commands: ['opera'] },
  ];

  const found: BrowserInfo[] = [];
  // Use which to locate the executable
  for (const c of candidates) {
    for (const cmd of c.commands) {
      try {
        const result = require('child_process').execSync(`which ${cmd} 2>/dev/null`, { encoding: 'utf-8' }).trim();
        if (result) {
          found.push({ name: c.name, key: c.key, emoji: c.emoji, exePath: result });
          break;
        }
      } catch { /* not found */ }
    }
  }
  return found;
}

/** Unified detection entry point */
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

// ---- OAuth local server ----

/** Start a local HTTP server on a random free port; returns { server, port, codePromise } */
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
          // Authorization code received → return a success page
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>GitPilot · Authorization Successful</title>
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
    <h1>Authorization successful!</h1>
    <p>You can close this page and return to VS Code to continue using GitPilot.</p>
  </div>
</body>
</html>`);

          codeResolve(code);

          // Close the server after 1 second
          setTimeout(() => {
            server.close();
          }, 1000);
        } else if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<html><body><h1>Authorization failed</h1><p>${error}</p></body></html>`);
          codeReject(new Error(`OAuth error: ${error}`));
        } else {
          // Not an OAuth callback; return a notice
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<html><body><h1>GitPilot OAuth</h1><p>Waiting for the authorization callback...</p></body></html>`);
        }
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    // Listen on a random port
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        resolve({ server, port: addr.port, codePromise });
      } else {
        reject(new Error('Unable to get the server port'));
      }
    });
  });
}

// ---- Open the browser ----

/** Open a URL with the given browser */
function openWithBrowser(browserPath: string, url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const platform = os.platform();

    let command: string;
    if (platform === 'darwin') {
      // macOS: open -a "AppName" "url"
      command = `open -a "${browserPath}" "${url}"`;
    } else if (platform === 'win32') {
      // Windows: use the exe path directly
      command = `start "" "${browserPath}" "${url}"`;
    } else {
      // Linux
      command = `"${browserPath}" "${url}"`;
    }

    exec(command, { timeout: 5000 }, (err) => {
      if (err) {
        reject(new Error(`Unable to open the browser: ${err.message}`));
      } else {
        resolve();
      }
    });
  });
}

// ---- Main flow ----

/** Show the browser picker panel (QuickPick)
 * @returns BrowserInfo — the browser chosen by the user
 * @returns null — the user chose "System default browser"
 * @returns undefined — the user cancelled the selection
 */
export async function promptBrowserSelection(): Promise<BrowserInfo | null | undefined> {
  const browsers = detectBrowsers();

  if (browsers.length === 0) {
    vscode.window.showWarningMessage('⚠️ No installed browser detected; the system default browser will be used.');
    return null;
  }

  // Build the QuickPick items
  const items: (vscode.QuickPickItem & { browser?: BrowserInfo; isDefault?: boolean })[] = browsers.map((b) => ({
    label: `${b.emoji}  ${b.name}`,
    description: b.exePath,
    detail: `Open the GitHub authorization page with ${b.name}`,
    browser: b,
  }));

  // Add the "use system default browser" option
  items.push({
    label: '🌍  System default browser',
    description: "Use the operating system's default browser",
    detail: 'Automatically opens the authorization page in the system default browser',
    isDefault: true,
  });

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: '🔐 Choose a browser for GitHub sign-in',
    title: 'GitPilot · Browser selection',
    matchOnDescription: true,
    matchOnDetail: false,
  });

  if (!picked) return undefined;            // user cancelled
  if (picked.isDefault) return null;         // system default browser
  return picked.browser!;                    // specific browser
}

/**
 * Run the full browser OAuth login flow:
 * 1. Start the local OAuth callback server
 * 2. Open the GitHub authorization page in the selected browser
 * 3. Wait for the user to finish authorization
 * 4. Return the authorization code
 *
 * @param authUrl  GitHub OAuth authorization URL
 * @param browser  the browser chosen by the user (null = system default)
 * @param timeoutMs timeout in milliseconds
 * @returns the authorization code
 */
export async function performBrowserOAuth(
  authUrl: string,
  browser: BrowserInfo | null,
  timeoutMs: number = 120_000, // 2 minute timeout
): Promise<string> {
  // 1. Start the local callback server
  const { server, port, codePromise } = await startOAuthServer();

  // 2. Replace the callback URL port with the actual port
  const finalAuthUrl = authUrl.replace(/redirect_uri=([^&]+)/, (_, uri) => {
    const decoded = decodeURIComponent(uri);
    const newUri = decoded.replace(/localhost:\d+/, `localhost:${port}`);
    return `redirect_uri=${encodeURIComponent(newUri)}`;
  });

  try {
    // 3. Open the browser
    if (browser) {
      await openWithBrowser(browser.exePath, finalAuthUrl);
    } else {
      // System default browser → use vscode.env.openExternal
      await vscode.env.openExternal(vscode.Uri.parse(finalAuthUrl));
    }

    // 4. Show a progress indicator
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: '⏳ Waiting for GitHub authorization...',
        cancellable: true,
      },
      async (progress, cancelToken) => {
        // timeout + cancellation race
        const timeoutPromise = new Promise<string>((_, rej) => {
          setTimeout(() => rej(new Error('Authorization timed out (2 minutes). Please try again.')), timeoutMs);
        });

        const cancelPromise = new Promise<string>((_, rej) => {
          cancelToken.onCancellationRequested(() => {
            rej(new Error('Authorization cancelled by the user'));
          });
        });

        // Wait for whichever finishes first
        await Promise.race([codePromise, timeoutPromise, cancelPromise]);
      },
    );

    // If we get here without a code yet (codePromise should be resolved), await the code
    const code = await codePromise;
    return code;
  } finally {
    // Make sure the server is closed
    server.close();
  }
}
