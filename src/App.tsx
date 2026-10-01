import { useEffect } from 'react';
import { I, Toasts } from './components/ui';
import { darkStatusBar, onActive, onDeepLink } from './native';
import ChartScreen from './screens/ChartScreen';
import Home from './screens/Home';
import More from './screens/More';
import Positions from './screens/Positions';
import Analysis from './screens/Analysis';
import Live from './screens/Live';
import LiveControls from './screens/LiveControls';
import LivePositions from './screens/LivePositions';
import LiveStats from './screens/LiveStats';
import { boot, go, goPath, refresh, useStore, type Route } from './store';

const TABS: [Route['tab'], string, keyof typeof I][] = [
  ['live', 'Live', 'chart'], ['positions', 'Positions', 'pos'], ['live_stats', 'Stats', 'setups'],
  ['live_controls', 'Controls', 'gear'], ['more', 'More', 'more'],
];

export default function App() {
  const ready = useStore((s) => s.ready);
  const route = useStore((s) => s.route);
  const theme = useStore((s) => s.conn.theme);
  const npos = useStore((s) => {
    const p = s.state?.positions || [], g = s.state?.groups || [];
    return g.length + p.filter((x) => !x.group_id || !g.find((y) => y.gid === x.group_id)).length;
  });

  useEffect(() => {
    boot().then(() => onDeepLink(goPath));
    let timer: any = setInterval(refresh, 3000);
    onActive((a) => {
      clearInterval(timer);
      if (a) { refresh(); timer = setInterval(refresh, 3000); }
    });
    return () => clearInterval(timer);
  }, []);
  useEffect(() => { darkStatusBar(theme === 'dark'); }, [theme]);

  if (!ready) return <div className="boot">Keel</div>;
  return (
    <div className="app">
      <main className="main">
        {route.tab === 'live' && <Live />}
        {route.tab === 'live_stats' && <LiveStats />}
        {route.tab === 'live_controls' && <LiveControls />}
        {route.tab === 'home' && <Home />}
        {route.tab === 'chart' && <ChartScreen />}
        {(route.tab === 'analysis' || route.tab === 'setups') && <Analysis />}
        {route.tab === 'positions' && <LivePositions />}
        {route.tab === 'more' && <More />}
      </main>
      <nav className="tabs">
        {TABS.map(([k, label, ic]) => {
          const Ic = I[ic];
          return (
            <button key={k} className={`tab ${route.tab === k ? 'on' : ''}`} onClick={() => go({ tab: k! })}>
              <Ic s={22} />{label}{k === 'positions' && npos > 0 && <span className="badge">{npos}</span>}
            </button>
          );
        })}
      </nav>
      <Toasts />
    </div>
  );
}
