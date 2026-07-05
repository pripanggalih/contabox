import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DriveClient } from './drive-client';

const OK = (body: unknown) =>
  ({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as Response;

describe('DriveClient', () => {
  let client: DriveClient;
  beforeEach(() => {
    client = new DriveClient('test-client-id');
    vi.restoreAllMocks();
  });

  it('finds an existing file by name in appDataFolder', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      OK({ files: [{ id: 'file-1', name: 'contabox-vault.enc' }] }),
    );
    const id = await client.findOrCreateFile('tok', 'contabox-vault.enc');
    expect(id).toBe('file-1');
  });

  it('creates the file when none exists', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(OK({ files: [] })) // list → empty
      .mockResolvedValueOnce(OK({ id: 'new-file' })); // create
    const id = await client.findOrCreateFile('tok', 'contabox-vault.enc');
    expect(id).toBe('new-file');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('upload returns the new headRevisionId', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(OK({ headRevisionId: 'rev-9' }));
    const res = await client.upload('tok', 'file-1', '{"cipher":"x"}');
    expect(res.headRevisionId).toBe('rev-9');
  });

  it('throws on a non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => 'no',
    } as Response);
    await expect(client.getMeta('tok', 'file-1')).rejects.toThrow(/403/);
  });
});
