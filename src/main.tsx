import { createRoot } from 'react-dom/client';
import App from './App';

// A crash must never leave a blank screen: show what went wrong and a way back.
window.addEventListener('error', (e) => showFatal(e.message));
window.addEventListener('unhandledrejection', (e: any) => console.warn('unhandled', e?.reason));
function showFatal(msg: string) {
  const r = document.getElementById('root');
  if (r && !r.querySelector('.app')) {
    r.innerHTML = `<div class="boot-err"><b>Keel could not start</b><p>${String(msg).replace(/</g, '&lt;')}</p><button onclick="location.reload()">Reload</button></div>`;
  }
}
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.update().catch(() => {}))).catch(() => {});
}
try {
  createRoot(document.getElementById('root')!).render(<App />);
} catch (e: any) { showFatal(e?.message || String(e)); }
