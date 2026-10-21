// Update-Prüfung für die Handy-App (APK) und die Windows-Version (.exe):
// fragt beim Start das neueste GitHub-Release ab und bietet den Download an, wenn es neuer ist.
// (Die Browser-Version ist immer automatisch aktuell.)
import { APP_VERSION, REPO } from './version.js';
import { $ } from './ui/ui.js';

export const platform = () => {
  if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) return 'android';
  if (/Electron/i.test(navigator.userAgent)) return 'windows';
  return 'web';
};

const newer = (a, b) => {
  const pa = String(a).replace(/^v/, '').split('.').map(Number), pb = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); }
  return false;
};

export async function checkForUpdate() {
  const pf = platform();
  $('versionInfo').textContent = `v${APP_VERSION}${pf === 'android' ? ' · Android' : pf === 'windows' ? ' · Windows' : ''}`;
  if (pf === 'web') return;
  let rel;
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { cache: 'no-store' });
    if (!r.ok) return;
    rel = await r.json();
  } catch (e) { return; } // offline: einfach weiter
  if (!rel || !rel.tag_name || !newer(rel.tag_name, APP_VERSION)) return;
  const want = pf === 'android' ? /\.apk$/i : /Setup\.exe$/i;
  const asset = (rel.assets || []).find((a) => want.test(a.name));
  const url = asset ? asset.browser_download_url : rel.html_url;
  $('updateText').innerHTML = `🆕 <b>Version ${rel.tag_name.replace(/^v/, '')}</b> ist da!`;
  $('btnUpdate').onclick = () => {
    // Android: öffnet den Download im Browser – danach die APK antippen und „Aktualisieren“ wählen.
    // Windows: lädt den neuen Installer herunter, der die alte Version ersetzt.
    if (pf === 'windows') window.open(url, '_blank'); else location.href = url;
    $('updateHint').textContent = pf === 'android' ? 'Download läuft – danach die Datei antippen und „Aktualisieren“ wählen.' : 'Download läuft – danach den Installer starten.';
  };
  $('updateBar').classList.remove('hidden');
}
