// Everything that touches the phone: saved settings, haptics, status bar, app open/close, keel:// links.
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Preferences } from '@capacitor/preferences';
import { StatusBar, Style } from '@capacitor/status-bar';

export const isNative = (() => { try { return Capacitor.isNativePlatform(); } catch { return false; } })();

export async function loadPref<T>(key: string, dflt: T): Promise<T> {
  try {
    const { value } = await Preferences.get({ key });
    return value == null ? dflt : { ...(dflt as any), ...JSON.parse(value) };
  } catch { return dflt; }
}
export async function savePref(key: string, v: unknown) {
  try { await Preferences.set({ key, value: JSON.stringify(v) }); } catch { /* ignore */ }
}

export const haptic = {
  tap: () => { Haptics.impact({ style: ImpactStyle.Light }).catch(() => {}); },
  heavy: () => { Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {}); },
  ok: () => { Haptics.notification({ type: NotificationType.Success }).catch(() => {}); },
  bad: () => { Haptics.notification({ type: NotificationType.Error }).catch(() => {}); },
};

export function darkStatusBar(dark: boolean) {
  if (!isNative) return;
  StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {});
}

/** Called with true/false when the app comes to the front / goes to the background. */
export function onActive(fn: (active: boolean) => void) {
  App.addListener('appStateChange', (s: any) => fn(!!s.isActive)).catch?.(() => {});
  document.addEventListener('visibilitychange', () => fn(document.visibilityState === 'visible'));
}

/** keel://chart/EURUSD, keel://positions, keel://setups … (notification taps from ntfy open these). */
export function onDeepLink(fn: (path: string) => void) {
  let last = '';
  const handle = (url?: string) => {
    if (!url || url === last) return;
    last = url;
    const m = url.match(/^keel:\/\/(.*)$/i);
    if (m) fn('/' + m[1].replace(/^\/+/, ''));
  };
  if (isNative) {
    App.addListener('appUrlOpen', (e: any) => handle(e?.url)).catch?.(() => {});
    (App as any).getLaunchUrl?.().then((r: any) => handle(r?.url)).catch?.(() => {});
  }
  const h = location.hash.replace(/^#/, '');
  if (h.startsWith('/')) fn(h);
}
