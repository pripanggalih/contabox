import { FINGERPRINT_PRESETS } from '@shared/fingerprint-presets';
import { invoke } from '@shared/messaging';
import type { FingerprintProfile, WebRtcMode } from '@shared/types';
import { Plus, Shuffle, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useOptionsStore } from '../state/store';

export function FingerprintPanel() {
  const profiles = useOptionsStore((s) => s.fingerprints);
  const refresh = useOptionsStore((s) => s.refresh);
  const [busy, setBusy] = useState(false);

  async function spawnRandom(presetKey: string) {
    setBusy(true);
    try {
      await invoke({ type: 'fingerprint.randomFromPreset', payload: { presetKey } });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete profile "${name}"?`)) return;
    await invoke({ type: 'fingerprint.delete', payload: { id } });
    await refresh();
  }

  async function setWebRtcMode(profile: FingerprintProfile, mode: WebRtcMode) {
    await invoke({ type: 'fingerprint.update', payload: { id: profile.id, webrtcMode: mode } });
    await refresh();
  }

  const preset = profiles.filter((p) => p.source === 'preset');
  const custom = profiles.filter((p) => p.source !== 'preset');

  return (
    <section className="rounded-lg border border-[var(--color-border)] p-4">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Fingerprints</h2>
        <div className="flex gap-2">
          <select
            disabled={busy}
            onChange={(e) => {
              if (e.target.value) {
                void spawnRandom(e.target.value);
                e.target.value = '';
              }
            }}
            className="input"
            defaultValue=""
            aria-label="Spawn random from preset"
          >
            <option value="">+ Random from preset…</option>
            {FINGERPRINT_PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </header>

      <p className="mb-3 text-xs text-[var(--color-text-muted)]">
        Built-in presets seed automatically. Use the dropdown to spawn a randomized profile based on
        a preset. Per-container WebRTC mode is best-effort: Firefox applies the strictest mode in
        use across all containers.
      </p>

      <h3 className="mb-1.5 text-xs font-semibold uppercase text-[var(--color-text-muted)]">
        Presets ({preset.length})
      </h3>
      <ul className="mb-4 space-y-1">
        {preset.map((p) => (
          <ProfileRow key={p.id} profile={p} onWebRtc={setWebRtcMode} />
        ))}
      </ul>

      <h3 className="mb-1.5 text-xs font-semibold uppercase text-[var(--color-text-muted)]">
        Custom / Random ({custom.length})
      </h3>
      {custom.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">No custom profiles yet.</p>
      ) : (
        <ul className="space-y-1">
          {custom.map((p) => (
            <ProfileRow
              key={p.id}
              profile={p}
              onWebRtc={setWebRtcMode}
              onDelete={() => remove(p.id, p.name)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ProfileRow({
  profile,
  onWebRtc,
  onDelete,
}: {
  profile: FingerprintProfile;
  onWebRtc: (p: FingerprintProfile, mode: WebRtcMode) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
}) {
  return (
    <li className="grid grid-cols-12 items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2.5 py-2 text-sm">
      <div className="col-span-4 min-w-0">
        <div className="truncate font-medium">{profile.name}</div>
        <div className="truncate text-xs text-[var(--color-text-muted)]">
          {profile.timezone} · {profile.language} · {profile.screen.width}×{profile.screen.height}
        </div>
      </div>
      <div className="col-span-5 truncate font-mono text-[10px] text-[var(--color-text-muted)]">
        {profile.ua}
      </div>
      <select
        value={profile.webrtcMode}
        onChange={(e) => void onWebRtc(profile, e.target.value as WebRtcMode)}
        aria-label="WebRTC mode"
        className="col-span-2 input"
      >
        <option value="real">RTC: real</option>
        <option value="proxy">RTC: proxy-only</option>
        <option value="disabled">RTC: disabled</option>
      </select>
      <div className="col-span-1 text-right">
        {onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete profile"
            className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-danger)]"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    </li>
  );
}

void Plus;
void Shuffle;
