import { createResource, createSignal, Match, onCleanup, Switch } from 'solid-js';
import { api } from './api';
import Library from './views/Library';
import Videos from './views/Videos';
import Editor from './views/Editor';
import Jobs from './views/Jobs';
import Music from './views/Music';
import { canLeave } from './guard';

// маршруты: #/library/<tab>, #/videos, #/v/<id>, #/music, #/jobs
const parse = () => location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);

export default function App() {
  const [route, setRoute] = createSignal(parse());
  let acceptedHash = location.hash;
  const onHash = () => {
    if (!canLeave()) { history.replaceState(null, '', location.pathname + location.search + acceptedHash); return; }
    acceptedHash = location.hash; setRoute(parse());
  };
  window.addEventListener('hashchange', onHash);
  onCleanup(() => window.removeEventListener('hashchange', onHash));

  const [assets, { refetch: refetchAssets }] = createResource(api.assets);
  const [videos, { refetch: refetchVideos }] = createResource(api.videos);
  const [jobs, { refetch: refetchJobs }] = createResource(api.jobs);
  const timer = setInterval(refetchJobs, 3000);
  onCleanup(() => clearInterval(timer));

  const section = () => route()[0] || 'library';
  const assetCount = () => { const a = assets(); return a ? Object.values(a).reduce((n, l) => n + l.length, 0) : 0; };
  const running = () => jobs()?.filter(j => j.status === 'running').length || 0;

  const Nav = (p: { to: string; icon: string; label: string; count?: number | string; active: boolean }) => (
    <a class="nav" classList={{ active: p.active }} href={p.to}>
      <span class="mi">{p.icon}</span><span>{p.label}</span>
      {p.count ? <span class="cnt">{p.count}</span> : null}
    </a>
  );

  return (
    <div class="app">
      <aside class="side">
        <div class="brand">Studio <span>const_proxima</span></div>
        <Nav to="#/library" icon="photo_library" label="Библиотека" count={assetCount()} active={section() === 'library'} />
        <Nav to="#/videos" icon="movie" label="Ролики" count={videos()?.length} active={section() === 'videos' || section() === 'v'} />
        <Nav to="#/music" icon="library_music" label="Музыка" active={section() === 'music'} />
        <Nav to="#/jobs" icon="memory" label="Сборки" count={running() ? `${running()} идет` : jobs()?.length} active={section() === 'jobs'} />
        <div class="side-foot">
          <button class="btn ghost" onClick={() => { refetchAssets(); refetchVideos(); }}><span class="mi">refresh</span>Обновить</button>
        </div>
      </aside>
      <main class="main">
        <Switch>
          <Match when={section() === 'library'}>
            <Library assets={assets()} videos={videos()} onRefresh={refetchAssets} tab={route()[1] || 'wallpapers'} />
          </Match>
          <Match when={section() === 'videos'}>
            <Videos videos={videos()} onCreated={refetchVideos} />
          </Match>
          <Match when={section() === 'v' && route()[1]}>
            <Editor id={route().slice(1).join('/')} onJobsChange={refetchJobs} onAssetsChange={refetchAssets} />
          </Match>
          <Match when={section() === 'music'}>
            <Music videos={videos()} onChanged={refetchVideos} />
          </Match>
          <Match when={section() === 'jobs'}>
            <Jobs jobs={jobs()} />
          </Match>
        </Switch>
      </main>
    </div>
  );
}
