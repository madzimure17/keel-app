// Bundles the app with esbuild into dist/ (native app) — or, with --web, into ../pwa (the same app served by the
// engine at https://<vps>:8443 as a fallback). --shims uses dev/shims instead of the Capacitor packages (for builds
// where node_modules is not installed; the shims are working web versions).
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = process.argv.includes('--web');
const shims = process.argv.includes('--shims') || !existsSync(join(here, 'node_modules/@capacitor/core'));
const out = web ? join(here, '../pwa') : join(here, 'dist');
const preserved = web && existsSync(out) ? readdirSync(out).filter((n) => n === 'Keel.ipa' || /^setup-.*\.html$/.test(n))
  .map((n) => [n, readFileSync(join(out, n))]) : [];
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'icons'), { recursive: true });

const alias = shims ? Object.fromEntries(['core', 'app', 'haptics', 'preferences', 'status-bar']
  .map((p) => [`@capacitor/${p}`, join(here, `dev/shims/${p}.ts`)])) : {};
const nodePaths = process.env.NODE_PATH ? process.env.NODE_PATH.split(':') : [];

await build({
  entryPoints: [join(here, 'src/main.tsx')], bundle: true, minify: true, sourcemap: false, format: 'esm',
  target: ['safari15'], jsx: 'automatic', outfile: join(out, 'app.js'), alias, nodePaths,
  define: { 'process.env.NODE_ENV': '"production"', __WEB__: String(web) }, logLevel: 'info',
});
cpSync(join(here, 'src/theme.css'), join(out, 'app.css'));
cpSync(join(here, 'resources/icon.png'), join(out, 'icons/icon.png'));
const version = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8')).version;
let html = readFileSync(join(here, 'index.html'), 'utf8').replaceAll('__VERSION__', version);
if (!web) html = html.replace(/.*rel="manifest".*\n/, '');
writeFileSync(join(out, 'index.html'), html);
if (web) {
  writeFileSync(join(out, 'manifest.webmanifest'), JSON.stringify({
    name: 'Keel', short_name: 'Keel', start_url: '/', display: 'standalone', background_color: '#0F1B24',
    theme_color: '#0F1B24', icons: [{ src: '/icons/icon.png', sizes: '1024x1024', type: 'image/png' }] }));
  // the old web app installed a caching service worker; this one removes itself and its caches
  writeFileSync(join(out, 'sw.js'), `self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.map(k=>caches.delete(k))))
 .then(()=>self.registration.unregister()).then(()=>self.clients.matchAll()).then(cs=>cs.forEach(c=>c.navigate(c.url)))));`);
  for (const [name, data] of preserved) writeFileSync(join(out, name), data);
}
console.log(`built ${web ? 'web app -> ../pwa' : 'native web assets -> dist'}${shims ? ' (shims)' : ''} v${version}`);
