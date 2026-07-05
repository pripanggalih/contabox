/**
 * Google Drive client — dumb transport for the encrypted sync blob. Knows
 * nothing about the bundle's contents; only handles OAuth + the Drive v3 REST
 * surface for a single file in `appDataFolder`.
 *
 * ponytail: v1 re-runs the interactive auth flow (returns a fresh short-lived
 * access token) rather than implementing OAuth refresh-token exchange. Upgrade
 * to a refresh flow only if re-consent prompts annoy users in practice.
 */
import { browser } from '@shared/browser';

const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

export class DriveClient {
  constructor(private readonly clientId: string) {}

  /** Interactive OAuth (implicit flow); returns a short-lived access token. */
  async authorize(): Promise<string> {
    const redirect = browser.identity.getRedirectURL();
    const url =
      'https://accounts.google.com/o/oauth2/auth' +
      `?client_id=${encodeURIComponent(this.clientId)}` +
      `&response_type=token` +
      `&redirect_uri=${encodeURIComponent(redirect)}` +
      `&scope=${encodeURIComponent(SCOPE)}` +
      `&prompt=consent`;
    const redirectResponse = await browser.identity.launchWebAuthFlow({ url, interactive: true });
    const m = /[#&]access_token=([^&]+)/.exec(redirectResponse ?? '');
    if (!m || !m[1]) throw new Error('Drive authorization failed: no access token');
    return decodeURIComponent(m[1]);
  }

  private async req(token: string, url: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    });
    if (!res.ok) {
      throw new Error(`Drive ${init.method ?? 'GET'} ${url} → ${res.status}: ${await res.text()}`);
    }
    return res;
  }

  async findOrCreateFile(token: string, name: string): Promise<string> {
    const q = encodeURIComponent(`name='${name}'`);
    const listRes = await this.req(
      token,
      `${DRIVE}/files?spaces=appDataFolder&q=${q}&fields=files(id,name)`,
    );
    const list = (await listRes.json()) as { files: Array<{ id: string }> };
    if (list.files.length > 0) return list.files[0]!.id;

    const createRes = await this.req(token, `${DRIVE}/files?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parents: ['appDataFolder'] }),
    });
    return ((await createRes.json()) as { id: string }).id;
  }

  async getMeta(token: string, fileId: string): Promise<{ headRevisionId: string; size: number }> {
    const res = await this.req(token, `${DRIVE}/files/${fileId}?fields=headRevisionId,size`);
    const j = (await res.json()) as { headRevisionId?: string; size?: string };
    return { headRevisionId: j.headRevisionId ?? '', size: Number(j.size ?? 0) };
  }

  async download(token: string, fileId: string): Promise<string> {
    const res = await this.req(token, `${DRIVE}/files/${fileId}?alt=media`);
    return res.text();
  }

  async upload(token: string, fileId: string, body: string): Promise<{ headRevisionId: string }> {
    const res = await this.req(
      token,
      `${UPLOAD}/files/${fileId}?uploadType=media&fields=headRevisionId`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body },
    );
    return { headRevisionId: ((await res.json()) as { headRevisionId: string }).headRevisionId };
  }
}
