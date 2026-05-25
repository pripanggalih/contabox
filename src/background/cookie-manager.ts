/**
 * CookieManager — per-container cookie CRUD + Netscape/JSON import-export.
 *
 * Wraps `browser.cookies.*` so the UI can list, edit, delete, and bulk import
 * cookies for a specific container (keyed by `storeId`).
 */
import { browser } from '@shared/browser';
import type { SnapshotCookie } from '@shared/types';

interface CookieRow extends SnapshotCookie {
  storeId: string;
}

export class CookieManager {
  async list(storeId: string, url?: string): Promise<CookieRow[]> {
    return (await browser.cookies.getAll({
      storeId,
      ...(url ? { url } : {}),
    })) as unknown as CookieRow[];
  }

  async set(storeId: string, cookie: SnapshotCookie & { url?: string }): Promise<void> {
    const url = cookie.url ?? buildUrl(cookie);
    await browser.cookies.set({
      storeId,
      url,
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite as never,
      expirationDate: cookie.expirationDate,
    });
  }

  async remove(
    storeId: string,
    name: string,
    domain: string,
    path: string,
    secure: boolean,
  ): Promise<void> {
    await browser.cookies.remove({
      storeId,
      url: buildUrl({ name, domain, path, secure } as SnapshotCookie),
      name,
    });
  }

  /**
   * Import Netscape-style `cookies.txt`. Each line:
   *   domain  flag  path  secure  expiration  name  value
   */
  async importNetscape(
    storeId: string,
    text: string,
  ): Promise<{ imported: number; errors: string[] }> {
    const errors: string[] = [];
    let imported = 0;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const parts = line.split(/\t/);
      if (parts.length < 7) {
        errors.push(`malformed: ${line}`);
        continue;
      }
      const [domain, , path, secureStr, expirationStr, name, value] = parts;
      try {
        await this.set(storeId, {
          name: name ?? '',
          value: value ?? '',
          domain: domain ?? '',
          path: path ?? '/',
          secure: (secureStr ?? 'FALSE').toUpperCase() === 'TRUE',
          httpOnly: false,
          sameSite: 'no_restriction',
          expirationDate: Number(expirationStr) || undefined,
        });
        imported++;
      } catch (err) {
        errors.push(`${name}: ${String(err)}`);
      }
    }
    return { imported, errors };
  }

  async importJson(storeId: string, text: string): Promise<{ imported: number; errors: string[] }> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      return { imported: 0, errors: [`invalid JSON: ${String(err)}`] };
    }
    if (!Array.isArray(parsed)) {
      return { imported: 0, errors: ['JSON root must be an array of cookies'] };
    }
    const errors: string[] = [];
    let imported = 0;
    for (const c of parsed as SnapshotCookie[]) {
      try {
        await this.set(storeId, c);
        imported++;
      } catch (err) {
        errors.push(`${c.name}: ${String(err)}`);
      }
    }
    return { imported, errors };
  }

  async exportJson(storeId: string, url?: string): Promise<string> {
    const rows = await this.list(storeId, url);
    return JSON.stringify(rows, null, 2);
  }

  async exportNetscape(storeId: string, url?: string): Promise<string> {
    const rows = await this.list(storeId, url);
    const lines = rows.map((c) => {
      const flag = c.domain.startsWith('.') ? 'TRUE' : 'FALSE';
      const secure = c.secure ? 'TRUE' : 'FALSE';
      const exp = c.expirationDate ? Math.floor(c.expirationDate) : 0;
      return [c.domain, flag, c.path, secure, exp, c.name, c.value].join('\t');
    });
    return ['# Netscape HTTP Cookie File', ...lines].join('\n');
  }
}

function buildUrl(c: Pick<SnapshotCookie, 'domain' | 'path' | 'secure'>): string {
  const protocol = c.secure ? 'https:' : 'http:';
  const domain = c.domain.replace(/^\./, '');
  return `${protocol}//${domain}${c.path}`;
}

export const cookieManager = new CookieManager();
