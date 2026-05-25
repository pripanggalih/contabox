/**
 * Vitest setup: mock `browser.*` API for unit tests + reset IndexedDB.
 */
import 'fake-indexeddb/auto';
import { _resetDb } from '@shared/db';
import { afterEach, beforeEach, vi } from 'vitest';

type Listener = (...args: unknown[]) => unknown;

class EventEmitter {
  listeners: Listener[] = [];
  addListener(fn: Listener) {
    this.listeners.push(fn);
  }
  removeListener(fn: Listener) {
    this.listeners = this.listeners.filter((f) => f !== fn);
  }
  emit(...args: unknown[]) {
    return this.listeners.map((f) => f(...args));
  }
}

interface MockIdentity {
  cookieStoreId: string;
  name: string;
  color: string;
  colorCode: string;
  icon: string;
  iconUrl: string;
}

const identities = new Map<string, MockIdentity>();
let identityCounter = 0;

function makeMockBrowser() {
  return {
    runtime: {
      onMessage: new EventEmitter(),
      onInstalled: new EventEmitter(),
      onStartup: new EventEmitter(),
      sendMessage: vi.fn(),
      openOptionsPage: vi.fn(),
    },
    contextualIdentities: {
      query: vi.fn(async () => Array.from(identities.values())),
      get: vi.fn(async (id: string) => {
        const i = identities.get(id);
        if (!i) throw new Error(`identity not found: ${id}`);
        return i;
      }),
      create: vi.fn(async (input: { name: string; color: string; icon: string }) => {
        identityCounter += 1;
        const id = `firefox-container-${identityCounter}`;
        const identity: MockIdentity = {
          cookieStoreId: id,
          name: input.name,
          color: input.color,
          colorCode: '#000000',
          icon: input.icon,
          iconUrl: '',
        };
        identities.set(id, identity);
        return identity;
      }),
      update: vi.fn(
        async (id: string, patch: Partial<{ name: string; color: string; icon: string }>) => {
          const i = identities.get(id);
          if (!i) throw new Error(`identity not found: ${id}`);
          Object.assign(i, patch);
          return i;
        },
      ),
      remove: vi.fn(async (id: string) => {
        const i = identities.get(id);
        if (!i) throw new Error(`identity not found: ${id}`);
        identities.delete(id);
        return i;
      }),
    },
    tabs: {
      query: vi.fn(async () => []),
      create: vi.fn(async (info: Record<string, unknown>) => ({ id: 1, ...info })),
      remove: vi.fn(async () => undefined),
      get: vi.fn(),
    },
    windows: {
      create: vi.fn(async () => ({ id: 1, tabs: [{ id: 1 }] })),
    },
    commands: {
      onCommand: new EventEmitter(),
    },
    sidebarAction: {
      open: vi.fn(),
    },
  };
}

beforeEach(() => {
  identities.clear();
  identityCounter = 0;
  (globalThis as Record<string, unknown>).browser = makeMockBrowser();
});

afterEach(async () => {
  // fake-indexeddb retains state between tests; reset by deleting the DB.
  const dbs = await indexedDB.databases?.().catch(() => []);
  if (dbs) {
    await Promise.all(
      dbs.map(
        (d) =>
          new Promise<void>((resolve) => {
            if (!d.name) return resolve();
            const req = indexedDB.deleteDatabase(d.name);
            req.onsuccess = req.onerror = req.onblocked = () => resolve();
          }),
      ),
    );
  }
  _resetDb();
});
