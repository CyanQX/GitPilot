// ============================================================
// SmartFilter — 智能文件过滤
// 兼容 .gitignore + 内置规则 + 密钥文件拦截
// 不依赖任何平台
// ============================================================

import * as fs from 'fs';
import * as path from 'path';

export interface FilterResult {
  allowed: string[];
  blocked: Array<{ file: string; reason: string }>;
}

const BUILTIN_IGNORES = [
  'node_modules/', '.git/', '.vscode/', '.idea/',
  'dist/', 'build/', 'out/', 'target/',
  'cache/', 'logs/', 'temp/', 'tmp/',
  '*.log', '*.tmp', '.DS_Store', 'Thumbs.db',
];

const SECRET_FILES = [
  '.env', '.env.local', '.env.production',
  '*.pem', '*.key', '*.p12', '*.pfx',
  '*.keystore', '*.jks', 'credentials.json',
  'service-account.json', 'secrets.yml', 'secrets.yaml',
];

export class SmartFilter {
  private ignorePatterns: string[];
  private blockSecrets: boolean;

  constructor(workspaceRoot: string, options?: { extraIgnores?: string[]; blockSecrets?: boolean }) {
    this.blockSecrets = options?.blockSecrets ?? true;

    // 加载 .gitignore
    this.ignorePatterns = [...BUILTIN_IGNORES];
    const gitignorePath = path.join(workspaceRoot, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      this.ignorePatterns.push(
        ...content.split('\n')
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith('#')),
      );
    }
    if (options?.extraIgnores) {
      this.ignorePatterns.push(...options.extraIgnores);
    }
    if (this.blockSecrets) {
      this.ignorePatterns.push(...SECRET_FILES);
    }
  }

  /** 过滤文件列表 */
  filter(files: string[]): FilterResult {
    const allowed: string[] = [];
    const blocked: Array<{ file: string; reason: string }> = [];

    for (const file of files) {
      if (this.shouldIgnore(file)) {
        blocked.push({ file, reason: this.getReason(file) });
      } else {
        allowed.push(file);
      }
    }

    return { allowed, blocked };
  }

  /** 单个文件判断 */
  shouldIgnore(filePath: string): boolean {
    const basename = path.basename(filePath);

    for (const pattern of this.ignorePatterns) {
      if (this.matchSimple(pattern, basename) || this.matchSimple(pattern, filePath)) {
        return true;
      }
    }
    return false;
  }

  private matchSimple(pattern: string, target: string): boolean {
    // 简单 glob 匹配（不引入 micromatch 依赖）
    if (pattern === target) return true;
    if (pattern.endsWith('/') && target.startsWith(pattern)) return true;
    if (pattern.startsWith('*.')) {
      return target.endsWith(pattern.substring(1));
    }
    if (pattern.includes('*')) {
      const regex = new RegExp(
        '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$',
      );
      return regex.test(target);
    }
    return target.includes(pattern);
  }

  private getReason(filePath: string): string {
    const basename = path.basename(filePath);
    if (basename.startsWith('.env')) return '环境变量文件';
    if (basename.endsWith('.pem') || basename.endsWith('.key')) return '密钥文件';
    if (filePath.includes('node_modules/')) return '依赖目录';
    if (filePath.includes('.git/')) return 'Git 内部文件';
    if (filePath.includes('dist/') || filePath.includes('build/')) return '构建产物';
    return '匹配忽略规则';
  }
}
