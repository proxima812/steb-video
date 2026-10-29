// Музыка с внешнего диска (только чтение): поиск, прослушивание, выбор трека для ролика.
// Выбранный файл копируется в music/ ролика и записывается в video.json только по кнопке.
import { createEffect, createMemo, createResource, createSignal, For, on, onCleanup, Show } from 'solid-js';
import { api, fmtSize, toast, trackUrl, type Track, type VideoSummary } from '../api';
import { ALL_DIRS, dirFromOption, dirOption, filterTracks } from '../music-filter';

const fmt = (s: number) => !isFinite(s) ? '-' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export default function Music(p: { videos?: VideoSummary[]; onChanged: () => void }) {
  const [cat, { refetch }] = createResource(api.music);
  const [q, setQ] = createSignal('');
  const [dir, setDir] = createSignal<string | null>(ALL_DIRS);
  const [video, setVideo] = createSignal(localStorage.getItem('studio:lastVideo') || '');
  const [detail, { refetch: refetchDetail }] = createResource(() => video() || null, id => api.video(id).catch(() => null));
  const [durations, setDurations] = createSignal<Record<string, number>>({});
  const [cur, setCur] = createSignal<Track | null>(null);
  const [playing, setPlaying] = createSignal(false);
  const [pos, setPos] = createSignal(0);
  const [len, setLen] = createSignal(0);
  const [confirmTrack, setConfirmTrack] = createSignal<Track | null>(null);
  const [busy, setBusy] = createSignal(false);

  createEffect(on(() => p.videos, v => { if (v?.length && !v.some(x => x.id === video())) setVideo(v[v.length - 1].id); }));
  const dirs = createMemo(() => [...new Set((cat()?.tracks || []).map(t => t.dir))].sort((a, b) => a.localeCompare(b, 'ru')));
  const list = createMemo(() => filterTracks(cat()?.tracks || [], dir(), q()));

  // проигрыватель
  const audio = new Audio();
  audio.preload = 'metadata';
  audio.ontimeupdate = () => setPos(audio.currentTime);
  audio.onloadedmetadata = () => setLen(audio.duration);
  audio.onplay = () => setPlaying(true);
  audio.onpause = () => setPlaying(false);
  audio.onerror = () => { setPlaying(false); toast('Не удалось воспроизвести файл: формат не поддерживается браузером или файл недоступен', true); };
  function play(t: Track) {
    if (cur()?.path === t.path) { audio.paused ? audio.play().catch(() => {}) : audio.pause(); return; }
    setCur(t); setPos(0); setLen(0); audio.src = trackUrl(t.path); audio.play().catch(() => {});
  }

  // длительность по метаданным, по одному файлу (Range-запросы, не весь файл)
  const probe = new Audio(); probe.preload = 'metadata';
  let queue: string[] = [], probing = false, alive = true;
  async function runQueue() {
    if (probing) return; probing = true;
    while (alive && queue.length) {
      const path = queue.shift()!;
      if (durations()[path] != null) continue;
      const d = await new Promise<number>(ok => {
        const done = (v: number) => { probe.onloadedmetadata = probe.onerror = null; clearTimeout(timer); ok(v); };
        const timer = setTimeout(() => done(NaN), 8000);
        probe.onloadedmetadata = () => done(probe.duration); probe.onerror = () => done(NaN);
        probe.src = trackUrl(path);
      });
      setDurations(x => ({ ...x, [path]: d }));
    }
    probing = false;
  }
  createEffect(on(list, l => { queue = l.slice(0, 300).map(t => t.path).filter(x => durations()[x] == null); runQueue(); }));
  onCleanup(() => { alive = false; audio.pause(); audio.removeAttribute('src'); probe.removeAttribute('src'); });

  async function use(t: Track) {
    const d = detail(); if (!d) return;
    setBusy(true);
    try {
      const r = await api.useTrack(d.id, t.path, d.config);
      toast(r.imported.created ? `Скопировано в ${r.imported.path} и выбрано в video.json` : `Уже есть ${r.imported.path}, выбрано в video.json`);
      setConfirmTrack(null); refetchDetail(); p.onChanged();
    } catch (e: any) { toast(e.message, true); }
    finally { setBusy(false); }
  }

  return (
    <div class="page music-page">
      <div class="row"><div class="title grow">Музыка</div><button class="btn ghost" onClick={() => refetch()}><span class="mi">refresh</span>Обновить</button></div>
      <Show when={cat()} fallback={<div class="empty">{cat.error ? String(cat.error.message) : 'Чтение папки...'}</div>}>{c =>
        <>
          <div class="muted small">Папка {c().root} · только чтение · {c().tracks.length} треков{c().skipped ? ` · пропущено ${c().skipped} (не аудио или недоступны)` : ''}{c().truncated ? ' · показаны первые 5000' : ''}</div>
          <Show when={!c().available}><div class="warnbox">{c().error}. Задайте STUDIO_MUSIC_ROOT или проверьте доступ к папке.</div></Show>
          <div class="toolbar">
            <div class="search"><span class="mi">search</span><input placeholder="Поиск по названию и папке" value={q()} onInput={e => setQ(e.currentTarget.value)} /></div>
            <Show when={dirs().length > 1}>
              <select value={dirOption(dir())} onChange={e => setDir(dirFromOption(e.currentTarget.value))}><option value={dirOption(ALL_DIRS)}>Все папки</option><For each={dirs()}>{x => <option value={dirOption(x)}>{x || '(корень)'}</option>}</For></select>
            </Show>
            <label class="row small">Ролик
              <select value={video()} onChange={e => { setVideo(e.currentTarget.value); localStorage.setItem('studio:lastVideo', e.currentTarget.value); }}>
                <For each={p.videos || []}>{v => <option value={v.id}>{v.num} · {v.slug}</option>}</For>
              </select>
            </label>
          </div>
          <Show when={detail()}>{d => <div class="muted small">Сейчас в ролике: {d().music ? d().music : d().config?.music === 'none' ? 'без музыки' : 'нет'}</div>}</Show>

          <Show when={cur()}>{t =>
            <div class="now">
              <button class="play big" onClick={() => play(t())}><span class="mi">{playing() ? 'pause' : 'play_arrow'}</span></button>
              <div class="grow">
                <div class="ell"><b>{t().name}</b> <span class="muted small">{t().dir}</span></div>
                <input type="range" min="0" max={len() || 0} step="0.1" value={pos()} onInput={e => { audio.currentTime = +e.currentTarget.value; setPos(audio.currentTime); }} />
              </div>
              <div class="time">{fmt(pos())} / {fmt(len())}</div>
              <button class="btn" disabled={!detail()} onClick={() => setConfirmTrack(t())}>Использовать в ролике</button>
            </div>}
          </Show>

          <div class="tracks">
            <For each={list()} fallback={<div class="empty">Ничего не найдено</div>}>{t =>
              <div class="track" classList={{ on: cur()?.path === t.path }}>
                <button class="play" onClick={() => play(t)}><span class="mi">{cur()?.path === t.path && playing() ? 'pause' : 'play_arrow'}</span></button>
                <div class="grow ell"><div class="ell">{t.name}</div><div class="muted small ell">{t.dir || 'корень'} · {t.path.split('.').pop()!.toUpperCase()} · {fmtSize(t.size)}</div></div>
                <span class="muted small time">{fmt(durations()[t.path] ?? NaN)}</span>
                <button class="btn ghost" disabled={!detail()} onClick={() => setConfirmTrack(t)}>В ролик</button>
              </div>}
            </For>
          </div>
        </>}
      </Show>

      <Show when={confirmTrack() && detail()}>
        <div class="modal-box" onClick={() => !busy() && setConfirmTrack(null)}>
          <div class="dialog" onClick={e => e.stopPropagation()}>
            <b>Музыка для ролика {detail()!.num} · {detail()!.slug}</b>
            <div>Трек «{confirmTrack()!.name}» будет скопирован в <code>video/{detail()!.id}/music/</code> (без перезаписи, одинаковый файл используется повторно), затем записан в <code>video.json</code> как music. Прежний video.json уйдет в work/studio-backups/. Исходная папка не меняется.</div>
            <div class="muted small">Сейчас: {detail()!.music || 'без музыки'}. Громкость и ducking задает конвейер (engine/audio/p5-audio.mjs).</div>
            <div class="row"><button class="btn primary" disabled={busy()} onClick={() => use(confirmTrack()!)}>{busy() ? 'Копирование...' : 'Скопировать и выбрать'}</button>
              <button class="btn ghost" disabled={busy()} onClick={() => setConfirmTrack(null)}>Отмена</button></div>
          </div>
        </div>
      </Show>
    </div>
  );
}
