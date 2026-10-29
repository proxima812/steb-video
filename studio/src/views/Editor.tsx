// Редактор ролика: черновик v.html (editor/store), превью черновика, раскадровка, дерево объектов и панели.
// Контракт - studio/docs/visual-editor.md.
import { createEffect, createMemo, createResource, createSignal, For, on, onCleanup, onMount, Show } from 'solid-js';
import { api, copy, draftUrl, fileUrl, fmtTime, Job, toast, VideoDetail } from '../api';
import { protectDraft } from '../guard';
import { MODE } from './Jobs';
import { editorHide, hitTest, rectOf, type PreviewWin } from '../editor/bridge';
import type { EditorCtx } from '../editor/context';
import { createPlayer, FPS, SPEEDS } from '../editor/player';
import { annotate, outer, parse, type SrcNode } from '../editor/source';
import { createDraftStore } from '../editor/store';
import { saveDraft } from '../editor/save';
import { kindOf } from '../editor/capabilities';
import type { Rect } from '../editor/safety';
import Stage, { H, W, type Box } from '../components/editor/Stage';
import ObjectTree, { nodeLabel } from '../components/editor/ObjectTree';
import ObjectPanel from '../components/editor/ObjectPanel';
import ScenePanel from '../components/editor/ScenePanel';
import CameraPanel from '../components/editor/CameraPanel';
import CatalogPanel from '../components/editor/CatalogPanel';
import CheckPanel from '../components/editor/CheckPanel';
import AssetsPanel from '../components/editor/AssetsPanel';
import RenderPanel from '../components/editor/RenderPanel';
import Timeline from '../components/editor/Timeline';
import { LiveArea } from '../components/editor/fields';

type Tab = 'object' | 'scene' | 'camera' | 'catalog' | 'check' | 'assets' | 'render' | 'source';
const TABS: [Tab, string][] = [['object', 'Объект'], ['scene', 'Сцена'], ['camera', 'Камера'], ['catalog', 'Каталог'], ['check', 'Проверка'], ['assets', 'Ассеты'], ['render', 'Рендер'], ['source', 'v.html']];

export default function Editor(p: { id: string; onJobsChange: () => void; onAssetsChange: () => void }) {
  const [data, { refetch, mutate }] = createResource(() => p.id, api.video);
  const [palettes] = createResource(api.palettes);
  const [assets, { refetch: refetchAssets }] = createResource(api.assets);
  const store = createDraftStore({ onDropped: n => toast(`Скрытие или блокировка снята с объектов (${n}): объект удален или заменен в черновике`) });

  const [mode, setMode] = createSignal<string>('html'); // 'html' или путь к mp4
  const [view, setView] = createSignal<'draft' | 'saved'>('draft');
  const [selectMode, setSelectMode] = createSignal(true);
  const [safe, setSafe] = createSignal(false);
  const [tab, setTab] = createSignal<Tab>('object');
  const [scale, setScale] = createSignal(0.3);
  const [scene, setScene] = createSignal(0);
  const [win, setWin] = createSignal<PreviewWin | null>(null);
  const [url, setUrl] = createSignal<string | null>(null);
  const [frame, setFrame] = createSignal(0);
  const [ghost, setGhost] = createSignal<Rect | null>(null);
  const [issueRects, setIssueRects] = createSignal<{ rect: Rect; level: string }[]>([]);
  const [pick, setPick] = createSignal<{ label: string; cb: (path: string) => void } | null>(null);
  const [mtime, setMtime] = createSignal(0);
  const [presetsVersion, setPresetsVersion] = createSignal(0);
  const [notes, setNotes] = createSignal<Record<string, string>>({});

  const dur = () => Math.max(data()?.duration || 0, ...store.scenes().map(s => s.e), 1);

  // ---------- кадр ----------
  const draw = (x: number) => {
    const w = win(); if (!w?.render || mode() !== 'html') return;
    try { w.render(x); } catch (e) { console.warn(e); }
    setFrame(f => f + 1);
  };
  const player = createPlayer({ dur, draw, enabled: () => mode() === 'html' });
  const live = createMemo(() => store.scenes().findIndex(s => player.t() >= s.s && player.t() < s.e));
  let video: HTMLVideoElement | undefined;
  createEffect(on(() => [data()?.voice, data()?.music], ([v, m]) => player.setSources(v ? fileUrl(v) : null, m ? fileUrl(m) : null)));
  createEffect(on(() => store.hidden(), h => { const w = win(); if (w) editorHide(w, h); }));

  // ---------- исходник и превью черновика ----------
  let postTimer: number | undefined, postSeq = 0;
  // ответы для прежнего ролика (смена p.id) и устаревшие ответы чтения диска игнорируются
  let diskGen = 0;
  async function loadSource(id: string) {
    const { html } = await api.source(id);
    const d = await api.mtime(id).catch(() => ({ mtime: 0 }));
    if (id !== p.id) return;
    store.open(html); setMtime(d.mtime);
  }
  createEffect(on(() => p.id, id => {
    diskGen++; postSeq++; clearTimeout(postTimer);
    player.pause(); player.setT(0); player.setLoop(null); setScene(0); setMode('html'); setView('draft'); setTab('object');
    store.open(null); setMtime(0); setAudioEdit(null); setWin(null); setUrl(null);
    loadSource(id).catch(e => { if (id === p.id) toast(e.message, true); });
    localStorage.setItem('studio:lastVideo', p.id);
  }));
  createEffect(on(() => data()?.id, () => setNotes(data()?.notes || {})));
  createEffect(on([() => store.draft(), view, () => store.base()], () => {
    const html = view() === 'saved' ? store.base() : store.draft();
    clearTimeout(postTimer);
    if (!html) return;
    const seq = ++postSeq, id = p.id;
    postTimer = window.setTimeout(async () => {
      try { const { key } = await api.draft(id, annotate(parse(html))); if (seq === postSeq && id === p.id) setUrl(draftUrl(id, key)); }
      catch (e: any) { if (id === p.id) toast('Превью черновика: ' + e.message, true); }
    }, 250);
  }));
  function onReady(w: PreviewWin) {
    setWin(w); editorHide(w, store.hidden()); draw(player.t());
  }

  // ---------- выбор в превью ----------
  const pickAt = (x: number, y: number) => {
    const w = win(); if (!w) return;
    const req = pick();
    const id = hitTest(w, x, y, req ? new Set() : store.locked());
    if (req) { setPick(null); if (id) req.cb(id); return; }
    store.setSel(id);
    const n = store.node(id); if (n) { setScene(n.section); if (tab() !== 'object' && tab() !== 'camera') setTab('object'); }
  };
  const boxes = createMemo<Box[]>(() => {
    frame(); store.draft();
    const w = win(); if (!w) return [];
    const out: Box[] = [];
    const add = (path: string | null, kind: Box['kind']) => {
      const n = store.node(path); if (!n) return;
      const r = rectOf(w, path!); if (r) out.push({ rect: r, kind, label: kind === 'sel' ? nodeLabel(n).kind : undefined });
    };
    if (store.hover() !== store.sel()) add(store.hover(), 'hover');
    add(store.sel(), 'sel');
    for (const r of issueRects()) out.push({ rect: r.rect, kind: r.level === 'error' ? 'issue' : 'warn' });
    const g = ghost(); if (g) out.push({ rect: g, kind: 'ghost', label: 'после исправления' });
    return out;
  });

  function pickScene(i: number) {
    const s = store.scenes()[i]; if (!s) return;
    setScene(i); player.pause(); player.setLoop(null);
    if (player.t() < s.s || player.t() >= s.e) player.seek(Math.min(s.s + 1, (s.s + s.e) / 2));
  }
  const focus = (t: number, path?: string | null) => {
    player.pause(); player.seek(t);
    if (path && store.node(path)) { store.setSel(path); setScene(store.node(path)!.section); }
  };

  // ---------- сохранение и внешние изменения ----------
  const [saving, setSaving] = createSignal(false);
  async function save(force = false) {
    if (!store.dirty() || saving()) return;
    const id = p.id, current = () => id === p.id;
    setSaving(true); diskGen++;
    try {
      const d = await saveDraft(store, (html, base) => api.saveSource(id, html, base), { force, current });
      if (!d) return;
      mutate(d); setMtime(d.mtime);
      toast((d.backup ? `Сохранено, бэкап ${d.backup.split('/').pop()}` : 'Сохранено') + (store.dirty() ? '. Правки, сделанные во время записи, остались в черновике' : ''));
    } catch (e: any) {
      if (!current()) return;
      if (/изменился/.test(e.message)) { const { html } = await api.source(id); if (current()) store.setConflict(html); }
      toast(e.message, true);
    } finally { diskGen++; setSaving(false); }
  }
  async function takeDisk() {
    const html = store.conflict(); if (html == null) return;
    diskGen++; store.load(html); await refetch(); toast('Загружена версия с диска, ваши правки доступны через ⌘Z');
  }
  onMount(() => {
    const poll = setInterval(async () => {
      if (!data() || document.hidden || saving() || store.base() == null) return;
      const id = p.id, gen = diskGen, stale = () => id !== p.id || gen !== diskGen || saving();
      const { mtime: m } = await api.mtime(id).catch(() => ({ mtime: 0 }));
      if (stale() || !m || m <= mtime()) return;
      const { html } = await api.source(id).catch(() => ({ html: null as string | null }));
      if (stale() || html == null) return;
      setMtime(m);
      if (html === store.base()) { refetch(); return; }
      if (!store.dirty()) { store.load(html); await refetch(); toast('v.html обновлен с диска'); }
      else { store.setConflict(html); toast('v.html изменился на диске, а у вас несохраненный черновик', true); }
    }, 1500);
    const key = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return; }
      if (mod && e.key.toLowerCase() === 'z' && !(e.target as HTMLElement).closest('input,textarea')) { e.preventDefault(); e.shiftKey ? store.redo() : store.undo(); return; }
      if ((e.target as HTMLElement).closest('input,textarea,select')) return;
      if (e.code === 'Space') { e.preventDefault(); player.toggle(); }
      else if (e.key === 'Escape') { setPick(null); store.setSel(null); setGhost(null); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); e.shiftKey ? (player.pause(), player.seek(player.t() - 1)) : player.step(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); e.shiftKey ? (player.pause(), player.seek(player.t() + 1)) : player.step(1); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); pickScene(Math.max(0, Math.min(store.scenes().length - 1, scene() + (e.key === 'ArrowDown' ? 1 : -1)))); }
    };
    window.addEventListener('keydown', key);
    onCleanup(() => { clearInterval(poll); window.removeEventListener('keydown', key); player.dispose(); clearTimeout(postTimer); });
  });

  // ---------- звук, загрузки, рендер ----------
  const [audioEdit, setAudioEdit] = createSignal<{ voice: string; music: string; base: unknown } | null>(null);
  const [uploadPending, setUploadPending] = createSignal(false);
  protectDraft(() => store.dirty() || !!store.pendingSrc() || !!audioEdit() || uploadPending() || saving());
  const [job, setJob] = createSignal<Job | null>(null);
  createEffect(on(() => p.id, async id => { const list = await api.jobs().catch(() => []); setJob(list.find(j => j.video === id) || null); }));
  async function render(m: string, range?: [number, number]) {
    if (store.dirty() || audioEdit() || uploadPending()) { toast('Сначала сохраните правки и завершите загрузку', true); return; }
    if (!data()?.voice) { toast('Сначала выберите готовую озвучку во вкладке Ассеты', true); return; }
    try { const j = await api.render(p.id, { mode: m, ...(range ? { from: range[0], to: range[1] } : {}) }); setJob(j); setTab('render'); p.onJobsChange(); }
    catch (e: any) { toast(e.message, true); }
  }
  const saveNotes = (n: Record<string, string>) => { setNotes(n); api.saveNotes(p.id, n).catch(e => toast(e.message, true)); };
  const allTasks = () => Object.keys(notes()).filter(k => notes()[k]?.trim() && store.scenes()[+k]).map(k => {
    const s = store.scenes()[+k], n = store.doc().sections[+k];
    return `Ролик video/${p.id}/v.html, сцена ${+k + 1} (data-s=${s.s}, data-e=${s.e}).\nПравка: ${notes()[k]}\n\nТекущий HTML сцены:\n${outer(store.doc(), n)}`;
  }).join('\n\n---\n\n');
  async function savePreset(n: SrcNode) {
    const name = prompt('Название пресета ролика', nodeLabel(n).kind + ' ' + (nodeLabel(n).text || '').slice(0, 20));
    if (!name?.trim()) return;
    try { const list = await api.presets(p.id); await api.savePresets(p.id, [...list, { name: name.trim(), html: outer(store.doc(), n), kind: kindOf(n), created: new Date().toISOString() }]); setPresetsVersion(v => v + 1); toast('Пресет сохранен в work/studio-presets.json'); }
    catch (e: any) { toast(e.message, true); }
  }

  const watchStage = (el: HTMLDivElement) => {
    const ro = new ResizeObserver(() => { const r = el.getBoundingClientRect(); setScale(Math.max(0.1, Math.min(r.width / W, r.height / H))); });
    ro.observe(el); onCleanup(() => ro.disconnect());
  };
  const videoTick = () => { if (video) { player.setT(video.currentTime); if (!video.paused) requestAnimationFrame(videoTick); } };
  const pal = (name: string) => palettes()?.[name];
  const word = createMemo(() => (data()?.words || []).findIndex(w => player.t() >= w[1] && player.t() < w[2] + 0.05));

  const ctx: EditorCtx = {
    get id() { return p.id; }, store, player, detail: () => data(), palettes: () => palettes(), assets: () => assets(), words: () => data()?.words || [], win,
    scene, pickScene, focus, setGhost,
    requestPick: (label, cb) => { setPick({ label, cb }); setSelectMode(true); toast(label + ': кликните по объекту в кадре'); },
  };

  return (
    <Show when={data()} fallback={<div class="page"><div class="empty">{data.error ? String(data.error.message) : 'Загрузка...'}</div></div>}>{d =>
      <div class="editor">
        {/* ---------- раскадровка и дерево ---------- */}
        <section class="col board">
          <div class="col-head">
            <a href="#/videos" class="back"><span class="mi">arrow_back</span></a>
            <div class="grow"><div class="name">{d().num} · {d().slug}</div><div class="meta">{fmtTime(dur())} · {store.scenes().length} сцен</div></div>
            <Show when={allTasks()}><button class="btn ghost icon" title="Скопировать все правки для агента" onClick={() => copy(allTasks())}><span class="mi">smart_toy</span></button></Show>
          </div>
          <div class="scenes">
            <For each={store.scenes()}>{s =>
              <button class="scene" classList={{ sel: scene() === s.index, live: live() === s.index }} onClick={() => pickScene(s.index)}>
                <div class="sw" classList={{ black: s.bg === 'black', white: s.bg === 'white' }} style={s.wall ? { 'background-image': `url(${fileUrl(s.wall)})` } : {}}>
                  <i style={{ background: pal(s.pal)?.fg || 'transparent' }} />
                </div>
                <div class="grow">
                  <div class="row"><b>{s.outro ? 'Концовка' : `Сцена ${s.index + 1}`}</b><span class="muted">{s.s.toFixed(1)}-{s.e.toFixed(1)}</span></div>
                  <div class="snip">{s.text || (s.outro ? 'const_proxima · НЕ ПОДПИСЫВАЙСЯ' : '-')}</div>
                  <div class="tags">
                    <Show when={s.pal}><span class="chip" style={{ color: pal(s.pal)?.fg, background: pal(s.pal)?.bg }}>{s.pal}</span></Show>
                    <Show when={s.tr}><span class="chip">{s.tr}</span></Show>
                    <Show when={notes()[s.index]?.trim()}><span class="chip note"><span class="mi">edit_note</span>правка</span></Show>
                  </div>
                </div>
              </button>}
            </For>
          </div>
          <div class="tree-box">
            <div class="group-h pad">Объекты сцены {scene() + 1}</div>
            <ObjectTree ctx={ctx} />
          </div>
        </section>

        {/* ---------- плеер ---------- */}
        <section class="col center">
          <Show when={store.conflict() != null}>
            <div class="conflict">
              <span class="mi">sync_problem</span><span class="grow">v.html изменился на диске, у вас несохраненный черновик.</span>
              <button class="btn" onClick={takeDisk}>Взять версию с диска</button>
              <button class="btn ghost" onClick={() => save(true)}>Сохранить мой поверх (с бэкапом)</button>
            </div>
          </Show>
          <div class="player-bar">
            <div class="seg">
              <button classList={{ on: mode() === 'html' }} onClick={() => { player.pause(); setMode('html'); draw(player.t()); }}>Демо HTML</button>
              <For each={d().outputs}>{o => <button classList={{ on: mode() === o.path }} onClick={() => { player.pause(); setMode(o.path); }}>{o.label}</button>}</For>
            </div>
            <Show when={mode() === 'html'}>
              <button class="btn ghost" classList={{ on: selectMode() }} title="Клик по кадру выбирает объект" onClick={() => setSelectMode(!selectMode())}><span class="mi">arrow_selector_tool</span>Выбор</button>
              <button class="btn ghost" classList={{ on: safe() }} onClick={() => setSafe(!safe())}><span class="mi">crop_free</span>Safe zone</button>
              <button class="btn ghost" classList={{ on: view() === 'saved' }} disabled={!store.dirty()} title="Показать сохраненную версию (до правок)" onClick={() => setView(view() === 'saved' ? 'draft' : 'saved')}><span class="mi">compare</span>{view() === 'saved' ? 'До' : 'После'}</button>
            </Show>
            <span class="grow" />
            <button class="btn ghost icon" title="Отменить (⌘Z)" disabled={!store.canUndo()} onClick={store.undo}><span class="mi">undo</span></button>
            <button class="btn ghost icon" title="Повторить (⇧⌘Z)" disabled={!store.canRedo()} onClick={store.redo}><span class="mi">redo</span></button>
            <button class="btn primary" disabled={!store.dirty() || saving()} onClick={() => save()}><span class="mi">save</span>Сохранить <span class="kbd">⌘S</span></button>
          </div>
          <Show when={pick()}><div class="pick-hint"><span class="mi">ads_click</span>{pick()!.label}: кликните по объекту в кадре <button class="link" onClick={() => setPick(null)}>отмена</button></div></Show>
          <div class="stage-box" ref={watchStage}>
            <Show when={mode() === 'html'} fallback={
              <div class="stage-frame" style={{ width: `${W * scale()}px`, height: `${H * scale()}px` }}>
                <video ref={video} src={fileUrl(mode()) + '?m=' + d().mtime} class="mp4" controls
                  onPlay={() => { player.setPlaying(true); videoTick(); }} onPause={() => player.setPlaying(false)} onEnded={() => player.setPlaying(false)}
                  onLoadedMetadata={() => { if (video) video.currentTime = Math.min(player.t(), video.duration || 0); }} />
              </div>}>
              <Stage url={url()} scale={scale()} select={selectMode() || !!pick()} safe={safe()} boxes={boxes()}
                onReady={onReady} onPick={pickAt} onToggle={player.toggle} onError={m => toast(m, true)}
                onHover={(x, y) => { const w = win(); store.setHover(w ? hitTest(w, x, y, store.locked()) : null); }} onLeave={() => store.setHover(null)} />
            </Show>
          </div>
          <div class="transport">
            <button class="play big" onClick={player.toggle}><span class="mi">{player.playing() ? 'pause' : 'play_arrow'}</span></button>
            <button class="btn ghost icon" title="Кадр назад (←)" onClick={() => player.step(-1)}><span class="mi">skip_previous</span></button>
            <button class="btn ghost icon" title="Кадр вперед (→)" onClick={() => player.step(1)}><span class="mi">skip_next</span></button>
            <div class="time">{fmtTime(player.t())} <span class="muted">/ {fmtTime(dur())}</span><div class="muted small">кадр {Math.round(player.t() * FPS)}</div></div>
            <Timeline ctx={ctx} dur={dur()} pal={pal} />
            <div class="seg small" title="Скорость">
              <For each={SPEEDS}>{x => <button classList={{ on: player.speed() === x }} onClick={() => player.setSpeed(x)}>{x}x</button>}</For>
            </div>
            <Show when={player.loop()} fallback={<button class="btn ghost icon" title="Цикл текущей сцены" onClick={() => { const s = store.scenes()[scene()]; if (s) player.setLoop([s.s, s.e]); }}><span class="mi">repeat</span></button>}>
              <button class="btn ghost on" title="Снять цикл" onClick={() => player.setLoop(null)}><span class="mi">repeat_on</span>{player.loop()![0].toFixed(1)}-{player.loop()![1].toFixed(1)}</button>
            </Show>
          </div>
          <Show when={d().words.length}>
            <div class="words">
              <For each={d().words}>{(w, i) => <span classList={{ on: i() === word(), past: w[2] < player.t() }} onClick={() => player.seek(w[1])}>{w[0]} </span>}</For>
            </div>
          </Show>
        </section>

        {/* ---------- инспектор ---------- */}
        <section class="col inspector">
          <div class="tabs small">
            <For each={TABS}>{([k, l]) =>
              <button class="tab" classList={{ active: tab() === k }} onClick={() => { if (!uploadPending() || confirm('Закрыть очередь загрузки? Незагруженные файлы нужно будет выбрать снова.')) setTab(k); }}>{l}
                <Show when={k === 'render' && job()?.status === 'running'}><span class="dot" /></Show>
              </button>}
            </For>
          </div>
          <div class="draft-state muted small">
            {store.dirty() ? `черновик: ${store.hist().past.length} шагов · последний: ${store.hist().present.label}` : 'черновик совпадает с файлом'}
          </div>
          <Show when={tab() === 'object'}><div class="pane"><ObjectPanel ctx={ctx} onSavePreset={savePreset} /></div></Show>
          <Show when={tab() === 'scene'}><div class="pane"><ScenePanel ctx={ctx} notes={notes()} onNotes={saveNotes} onRenderScene={() => { const s = store.scenes()[scene()]; if (s) render('preview', [s.s, s.e]); }} /></div></Show>
          <Show when={tab() === 'camera'}><div class="pane"><CameraPanel ctx={ctx} /></div></Show>
          <Show when={tab() === 'catalog'}><div class="pane"><CatalogPanel ctx={ctx} presetsVersion={presetsVersion()} /></div></Show>
          <Show when={tab() === 'check'}><div class="pane"><CheckPanel ctx={ctx} onIssueRects={setIssueRects} /></div></Show>
          <Show when={tab() === 'assets'}>
            <AssetsPanel ctx={ctx} detail={d()} audioEdit={audioEdit()} setAudioEdit={setAudioEdit} uploadPending={uploadPending()} onPending={setUploadPending}
              onUploaded={() => { refetchAssets(); p.onAssetsChange(); }}
              onAudioSaved={u => { mutate(c => c ? { ...c, config: u.config, voice: u.voice, music: u.music } : u); refetchAssets(); p.onAssetsChange(); }} />
          </Show>
          <Show when={tab() === 'render'}>
            <RenderPanel detail={d()} job={job()} scene={store.scenes()[scene()] ?? null} onRender={render}
              onFinish={async j => { setJob(j); p.onJobsChange(); if (j.status === 'done') { await refetch(); toast(`${MODE[j.mode]}: готово`); } }} />
          </Show>
          <Show when={tab() === 'source'}>
            <div class="pane fill">
              <LiveArea class="code fill" value={store.draft()} onInput={v => store.commit(v, 'Правка исходника', 'source')} />
              <div class="muted small">Полный v.html черновика: правки здесь и в панелях - один черновик и одна история. Сохранение - кнопкой вверху.</div>
            </div>
          </Show>
        </section>
      </div>}
    </Show>
  );
}
