import { vi } from 'vitest';

// Installs a window.electronAPI where every method is a vi.fn(); overrides replace defaults.
export function mockElectronAPI(overrides: Record<string, any> = {}) {
  const api: Record<string, any> = new Proxy(
    {},
    {
      get(target: any, prop: string) {
        if (!(prop in target)) target[prop] = vi.fn().mockResolvedValue(undefined);
        return target[prop];
      },
    }
  );
  for (const [k, v] of Object.entries(overrides)) api[k] = typeof v === 'function' && 'mock' in v ? v : vi.fn(v);
  (window as any).electronAPI = api;
  return api;
}
