import { createMemo, createSignal, For, Show } from 'solid-js';
import { Asset, Assets, copy, fileUrl, fmtSize, snippet, VideoSummary } from '../api';
import Waveform from '../components/Waveform';
import Upload from '../components/Upload';
import { protectDraft } from '../guard';

const TABS: { key: keyof Assets; label: string; audio?: boolean }[] = [
  { key: 'wallpapers', label: 'Обои' },
  { key: 'avatars', label: 'Аватары' },
  { key: 'images', label: 'Картинки' },
  { key: 'voices', label: 'Озвучка', audio: true },
  { key: 'music', label: 'Музыка', audio: true },
  { key: 'sfx', label: 'Звуки', audio: true },
];

// один общий плеер на всю библиотеку
const player = new Audio();
const [playing, setPlaying] = createSignal<string | null>(null);
const [progress, setProgress] = createSignal(0);
player.addEventListener('timeupdate', () => setProgress(player.duration ? player.currentTime / player.duration : 0));
player.addEventListener('ended', () => { setPlaying(null); setProgress(0); });
function toggle(a: Asset) {
  if (playing() === a.path) { player.pause(); setPlaying(null); return; }
  player.src = fileUrl(a.path); player.play(); setPlaying(a.path); setProgress(0);
}

export default function Library(p: { assets?: Assets; tab: string; videos?: VideoSummary[]; onRefresh: () => void }) {
  const [uploadOpen, setUploadOpen] = createSignal(false);
  const [uploadPending, setUploadPending] = createSignal(false);
  protectDraft(uploadPending);
  const [q, setQ] = createSignal('');
  const [use, setUse] = createSignal<'all' | 'used' | 'unused'>('all');
  const [zoom, setZoom] = createSignal<Asset | null>(null);
  const tab = () => TABS.find(t => t.key === p.tab) || TABS[0];

  const list = createMemo(() => {
    const all = p.assets?.[tab().key] || [];
    const s = q().trim().toLowerCase();
    return all.filter(a =>
      (!s || a.name.toLowerCase().includes(s) || a.source?.toLowerCase().includes(s)) &&
      (use() === 'all' || (use() === 'used') === a.usedIn.length > 0));
  });

  const UsedIn = (a: { usedIn: string[] }) => (
    <div class="used">
      <Show when={a.usedIn.length} fallback={<span class="muted">не используется</span>}>
        <For each={a.usedIn.slice(0, 3)}>{id => <a class="chip" href={`#/v/${id}`}>{id.split('/').pop()}</a>}</For>
        <Show when={a.usedIn.length > 3}><span class="muted">+{a.usedIn.length - 3}</span></Show>
      </Show>
    </div>
  );

  return (
    <div class="page">
      <div class="tabs">
        <For each={TABS}>{t =>
          <a class="tab" classList={{ active: t.key === tab().key }} href={`#/library/${t.key}`}>
            {t.label}<span>{p.assets?.[t.key].length ?? ''}</span>
          </a>}
        </For>
      </div>
      <div class="toolbar">
        <button class="btn primary" onClick={() => { if (!uploadPending() || confirm('Убрать очередь загрузки?')) { setUploadOpen(!uploadOpen()); setUploadPending(false); } }}>Добавить материал</button>
        <label class="search"><span class="mi">search</span>
          <input placeholder="Поиск по названию или ролику" value={q()} onInput={e => setQ(e.currentTarget.value)} />
        </label>
        <div class="seg">
          <For each={[['all', 'Все'], ['used', 'В роликах'], ['unused', 'Свободные']] as const}>{([k, l]) =>
            <button classList={{ on: use() === k }} onClick={() => setUse(k)}>{l}</button>}
          </For>
        </div>
      </div>

      <Show when={uploadOpen()}><Upload kind={tab().key} videos={p.videos} onDone={p.onRefresh} onPending={setUploadPending} /></Show>
      <Show when={p.assets} fallback={<div class="empty">Загрузка...</div>}>
        <Show when={list().length} fallback={<div class="empty">Ничего не найдено</div>}>
          <Show when={tab().audio} fallback={
            <div class="grid" classList={{ tall: tab().key === 'wallpapers' }}>
              <For each={list()}>{a =>
                <div class="card asset">
                  <button class="thumb" onClick={() => setZoom(a)}><img src={fileUrl(a.path)} loading="lazy" alt="" /></button>
                  <div class="name" title={a.name}>{a.name}</div>
                  <div class="meta">{a.source ? a.source + ' · ' : ''}{fmtSize(a.size)}</div>
                  <UsedIn usedIn={a.usedIn} />
                  <button class="btn pill" onClick={() => copy(snippet(tab().key, a))}><span class="mi">content_copy</span>Скопировать</button>
                </div>}
              </For>
            </div>}>
            <div class="grid audio">
              <For each={list()}>{a => {
                const [dur, setDur] = createSignal<number | null>(null);
                return (
                  <div class="card sound">
                    <div class="row">
                      <button class="play" onClick={() => toggle(a)}><span class="mi">{playing() === a.path ? 'pause' : 'play_arrow'}</span></button>
                      <div class="grow">
                        <div class="name" title={a.name}>{a.name.replace(/\.[^.]+$/, '')}</div>
                        <div class="meta">{a.source || tab().label}{dur() ? ` · ${dur()!.toFixed(1)} с` : ''} · {fmtSize(a.size)}</div>
                      </div>
                    </div>
                    <Waveform url={fileUrl(a.path)} progress={playing() === a.path ? progress() : 0} onDuration={setDur}
                      onSeek={k => { if (playing() !== a.path) toggle(a); player.currentTime = k * (player.duration || 0); }} />
                    <div class="row">
                      <button class="btn pill" onClick={() => copy(a.path)}><span class="mi">content_copy</span>Скопировать</button>
                      <UsedIn usedIn={a.usedIn} />
                    </div>
                  </div>
                );
              }}</For>
            </div>
          </Show>
        </Show>
      </Show>

      <Show when={zoom()}>{a =>
        <div class="modal" onClick={() => setZoom(null)}>
          <img src={fileUrl(a().path)} alt="" />
          <div class="modal-cap">{a().path}</div>
        </div>}
      </Show>
    </div>
  );
}
