// ============================================================
// SecretDetector — secret detector
// Rules are loaded from patterns.yml; updating rules requires no code changes
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger';

export interface SecretMatch {
  file: string;
  type: string;
  line?: number;
  match?: string;
  severity: 'high' | 'medium' | 'low';
  reason: string;
}

export class SecretDetector {
  private logger = new Logger('SecretDetector');
  private rules: any;
  private enabled: boolean;
  private maxFileSize: number;

  constructor(options?: { enabled?: boolean; maxFileSize?: number; rulesPath?: string }) {
    this.enabled = options?.enabled ?? true;
    this.maxFileSize = options?.maxFileSize ?? 1024 * 1024; // 1MB

    const rulesPath = options?.rulesPath ?? path.join(__dirname, 'patterns.yml');
    this.rules = this.loadRules(rulesPath);
  }

  /** Load rules from a YAML file */
  private loadRules(rulesPath: string): any {
    try {
      if (fs.existsSync(rulesPath)) {
        const content = fs.readFileSync(rulesPath, 'utf-8');
        return this.parseSimpleYaml(content);
      }
    } catch (error) {
      this.logger.warn(`Unable to load the rules file: ${rulesPath}`);
    }
    return this.getDefaultRules();
  }

  /** Simple YAML parsing (no external dependency) */
  private parseSimpleYaml(content: string): any {
    // Simple two-level YAML parsing, sufficient for patterns.yml
    const result: any = {};
    let currentSection = '';
    const listItems: any[] = [];

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      if (trimmed.endsWith(':') && !trimmed.startsWith('-')) {
        // new section
        if (currentSection && listItems.length > 0) {
          result[currentSection] = [...listItems];
          listItems.length = 0;
        }
        currentSection = trimmed.replace(/:$/, '');
      } else if (trimmed.startsWith('- pattern:') || trimmed.startsWith('- type:')) {
        // list item
        if (listItems.length === 0 || (trimmed.startsWith('- pattern:') && listItems[listItems.length - 1]?.pattern)) {
          listItems.push({});
        }
        const item = listItems[listItems.length - 1];
        if (trimmed.startsWith('- pattern:')) {
          item.pattern = trimmed.replace('- pattern:', '').trim().replace(/^["']|["']$/g, '');
        } else if (trimmed.startsWith('- type:')) {
          item.type = trimmed.replace('- type:', '').trim().replace(/^["']|["']$/g, '');
        }
      } else if (trimmed.startsWith('severity:')) {
        const item = listItems[listItems.length - 1];
        if (item) item.severity = trimmed.replace('severity:', '').trim();
      } else if (trimmed.startsWith('reason:')) {
        const item = listItems[listItems.length - 1];
        if (item) item.reason = trimmed.replace('reason:', '').trim().replace(/^["']|["']$/g, '');
      }
    }

    if (currentSection && listItems.length > 0) {
      result[currentSection] = [...listItems];
    }

    return result;
  }

  /** Built-in fallback rules */
  private getDefaultRules(): any {
    return {
      high_risk_files: [
        { pattern: '\\.env$', reason: 'Environment variable file' },
        { pattern: '\\.pem$', reason: 'PEM key file' },
        { pattern: '\\.key$', reason: 'Private key file' },
      ],
      content_patterns: [
        { pattern: 'ghp_[a-zA-Z0-9]{36}', type: 'GitHub Token', severity: 'high' },
      ],
    };
  }

  /** Detect by filename */
  detectByFilename(filename: string): SecretMatch | null {
    if (!this.enabled) return null;

    const basename = path.basename(filename);

    // High risk
    for (const rule of this.rules.high_risk_files ?? []) {
      try {
        if (new RegExp(rule.pattern, 'i').test(basename)) {
          return {
            file: filename,
            type: 'High-risk file',
            severity: 'high',
            reason: rule.reason ?? `Matched a high-risk pattern: ${rule.pattern}`,
          };
        }
      } catch { /* invalid regex, skip */ }
    }

    // Medium risk
    for (const rule of this.rules.medium_risk_files ?? []) {
      try {
        if (new RegExp(rule.pattern, 'i').test(basename)) {
          return {
            file: filename,
            type: 'Medium-risk file',
            severity: 'medium',
            reason: rule.reason ?? `Matched a medium-risk pattern: ${rule.pattern}`,
          };
        }
      } catch { /* skip */ }
    }

    return null;
  }

  /** Detect by content */
  detectByContent(filePath: string, content: string): SecretMatch[] {
    if (!this.enabled) return [];
    if (content.length > this.maxFileSize) return [];

    const matches: SecretMatch[] = [];
    const lines = content.split('\n');

    for (const rule of this.rules.content_patterns ?? []) {
      try {
        const regex = new RegExp(rule.pattern, 'gi');
        for (let i = 0; i < lines.length; i++) {
          const match = lines[i].match(regex);
          if (match) {
            matches.push({
              file: filePath,
              type: rule.type ?? 'Unknown',
              line: i + 1,
              match: this.mask(match[0]),
              severity: rule.severity ?? 'high',
              reason: `Detected ${rule.type ?? 'secret'} on line ${i + 1}`,
            });
          }
        }
      } catch { /* skip invalid regex */ }
    }

    return matches;
  }

  private mask(value: string): string {
    if (value.length <= 8) return '***';
    return value.substring(0, 4) + '***' + value.substring(value.length - 4);
  }
}
