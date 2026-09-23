// ============================================================
// GitHubAuthProvider — implements IAuthProvider
// ============================================================

import type { IAuthProvider } from '@gitpilot/core';
import type { UserInfo, AuthToken } from '@gitpilot/core';
import { Octokit } from '@octokit/rest';
import { Logger } from '@gitpilot/core';

export class GitHubAuthProvider implements IAuthProvider {
  readonly platform = 'github';
  private logger = new Logger('GitHubAuth');

  constructor(
    private clientId: string,
    private clientSecret?: string,
    private redirectUri?: string,
  ) {}

  getAuthorizationUrl(state?: string, redirectUriOverride?: string): string {
    const redirectUri = redirectUriOverride ?? this.redirectUri ?? 'http://localhost:52134/callback';
    const params = new URLSearchParams({
      client_id: this.clientId,
      scope: this.getRequiredScopes().join(' '),
      redirect_uri: redirectUri,
    });
    if (state) params.set('state', state);
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string, redirectUriOverride?: string): Promise<AuthToken> {
    const redirectUri = redirectUriOverride ?? this.redirectUri ?? 'http://localhost:52134/callback';
    const body: Record<string, string> = {
      client_id: this.clientId,
      code,
      redirect_uri: redirectUri,
    };
    if (this.clientSecret) {
      body.client_secret = this.clientSecret;
    }
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    const data: any = await res.json();
    if (data.error) throw new Error(`OAuth error: ${data.error_description ?? data.error}`);

    return {
      accessToken: data.access_token,
      tokenType: data.token_type ?? 'bearer',
      scope: data.scope ?? '',
      refreshToken: data.refresh_token,
    };
  }

  async validateToken(token: string): Promise<boolean> {
    try {
      const octokit = new Octokit({ auth: token });
      await octokit.rest.users.getAuthenticated();
      return true;
    } catch {
      return false;
    }
  }

  async getUserInfo(token: string): Promise<UserInfo> {
    const octokit = new Octokit({ auth: token });
    const { data } = await octokit.rest.users.getAuthenticated();
    return {
      login: data.login,
      id: data.id,
      avatarUrl: data.avatar_url,
      name: data.name,
      email: data.email,
      htmlUrl: data.html_url,
    };
  }

  async refreshToken(refreshToken: string): Promise<AuthToken> {
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });
    const data: any = await res.json();
    return {
      accessToken: data.access_token,
      tokenType: data.token_type ?? 'bearer',
      scope: data.scope ?? '',
      refreshToken: data.refresh_token ?? refreshToken,
    };
  }

  async revokeToken(token: string): Promise<void> {
    await fetch(`https://api.github.com/applications/${this.clientId}/token`, {
      method: 'DELETE',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
      },
      body: JSON.stringify({ access_token: token }),
    });
  }

  getRequiredScopes(): string[] {
    return ['repo', 'workflow'];
  }
}
