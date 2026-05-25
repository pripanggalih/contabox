/**
 * Options page Zustand store. Lives separately from sidebar's so each page
 * has its own React tree state.
 */
import { invoke } from '@shared/messaging';
import type { ContainerView, FingerprintProfile, Proxy, ProxyPool } from '@shared/types';
import { create } from 'zustand';

interface OptionsState {
  containers: ContainerView[];
  proxies: Proxy[];
  proxyPools: ProxyPool[];
  fingerprints: FingerprintProfile[];
  vault: { initialized: boolean; unlocked: boolean };
  refresh: () => Promise<void>;
}

export const useOptionsStore = create<OptionsState>((set) => ({
  containers: [],
  proxies: [],
  proxyPools: [],
  fingerprints: [],
  vault: { initialized: false, unlocked: false },

  async refresh() {
    const [containers, proxies, proxyPools, fingerprints, vaultStatus] = await Promise.all([
      invoke({ type: 'container.list' }),
      invoke({ type: 'proxy.list' }),
      invoke({ type: 'proxyPool.list' }),
      invoke({ type: 'fingerprint.list' }),
      invoke({ type: 'vault.status' }),
    ]);
    set({ containers, proxies, proxyPools, fingerprints, vault: vaultStatus });
  },
}));
