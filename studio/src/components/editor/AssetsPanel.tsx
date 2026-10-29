// Ассеты ролика: загрузка, выбор озвучки и музыки (video.json), картинка в черновик сцены.
import { createSignal, For, Show } from 'solid-js';
import { api, copy, fileUrl, toast, type VideoDetail } from '../../api';
import type { EditorCtx } from '../../editor/context';
import { insertHTML } from '../../editor/source';
import Upload from '../Upload';
import Waveform from '../Waveform';
import { dedupeIds } from './CatalogPanel';

export default function AssetsPanel(p: {
  ctx: EditorCtx; detail: VideoDetail; audioEdit: { voice: string; music: string; base: unknown } | null;
  setAudioEdit: (v: { voice: string; music: string; base: unknown } | null) => void;
  onAudioSaved: (d: VideoDetail) => void; onUploaded: () => void; onPending: (v: boolean) => void; uploadPending: boolean;
}) {
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal('');
  const [query, setQuery] = createSignal('');
  const [image, setImage] = createSignal('');
  const d = () => p.detail;
  const change = (key: 'voice' | 'music', value: string) =>
    p.setAudioEdit({ ...(p.audioEdit || { voice: d().voice || '', music: d().music || 'none', base: d().config }), [key]: value });
  async function save() {
    const edit = p.audioEdit; if (!edit || saving()) return;
    setSaving(true); setError(''); p.ctx.player.pause();
    try { p.onAudioSaved(await api.setAudio(p.ctx.id, edit.voice || undefined, edit.music, edit.base)); p.setAudioEdit(null); toast('Звук сохранен'); }
    catch (e: any) { setError(e.message); } finally { setSaving(false); }
  }
  function insertImage() {
    const sc = p.ctx.store.scenes()[p.ctx.scene()];
    if (!image() || !sc || sc.outro || p.uploadPending) return;
    const src = '../' + image().split('/').map(encodeURIComponent).join('/');
    const html = `<img class="pic" id="pic" src="${src}" alt="" style="width:240px;height:240px;object-fit:cover;align-self:flex-start" data-in="${sc.s}" data-a="rise">`;
    p.ctx.store.apply(doc => insertHTML(doc, doc.sections[p.ctx.scene()], dedupeIds(html, doc), 'append'), 'Картинка', { select: true });
    toast('Картинка добавлена в черновик сцены. Проверьте расположение и сохраните.');
  }
  return (
    <div class="pane">
      <Upload video={p.ctx.id} onDone={p.onUploaded} onPending={p.onPending} />
      <div class="group-h">Выбрать звук</div>
      <div class="fields">
        <label class="wide">Озвучка<select disabled={saving()} value={p.audioEdit?.voice ?? d().voice ?? ''} onChange={e => change('voice', e.currentTarget.value)}>
          <option value="" disabled>Выберите готовую озвучку</option>
          <Show when={d().voice && !p.ctx.assets()?.voices.some(a => a.path === d().voice)}><option value={d().voice!}>{d().voice}</option></Show>
          <For each={p.ctx.assets()?.voices}>{a => <option value={a.path}>{a.source} / {a.name}</option>}</For>
        </select></label>
        <label class="wide">Музыка<select disabled={saving()} value={p.audioEdit?.music ?? d().music ?? 'none'} onChange={e => change('music', e.currentTarget.value)}>
          <option value="none">Без музыки</option>
          <Show when={d().music && !p.ctx.assets()?.music.some(a => a.path === d().music)}><option value={d().music!}>{d().music}</option></Show>
          <For each={p.ctx.assets()?.music}>{a => <option value={a.path}>{a.source} / {a.name}</option>}</For>
        </select></label>
      </div>
      <Show when={error()}><div role="alert" class="error">{error()}</div></Show>
      <div class="row"><button class="btn primary" disabled={!p.audioEdit || saving()} onClick={save}>{saving() ? 'Сохранение...' : 'Сохранить звук'}</button>
        <button class="btn ghost" disabled={!p.audioEdit || saving()} onClick={() => { p.setAudioEdit(null); setError(''); }}>Отменить</button>
        <a class="btn ghost" href="#/music"><span class="mi">library_music</span>Музыка с диска</a></div>
      <div class="muted">При замене голоса нужно заново подготовить words.json и тайминги сцен. Загрузка аудио сама по себе их не меняет.</div>
      <div class="group-h">Картинка в сцену {p.ctx.scene() + 1}</div>
      <input aria-label="Поиск картинки" placeholder="Поиск картинки" value={query()} onInput={e => setQuery(e.currentTarget.value)} />
      <select aria-label="Картинка для сцены" value={image()} onChange={e => setImage(e.currentTarget.value)}>
        <option value="">Выберите картинку</option>
        <For each={p.ctx.assets()?.images.filter(a => a.name.toLowerCase().includes(query().toLowerCase()))}>{a => <option value={a.path}>{a.source} / {a.name}</option>}</For>
      </select>
      <Show when={image()}><div class="mini-grid"><img class="mini" src={fileUrl(image())} alt="Выбранная картинка" /></div></Show>
      <button class="btn" disabled={!image() || p.uploadPending} onClick={insertImage}>Добавить в черновик сцены</button>
      <Show when={d().voice}>
        <div class="group-h">Озвучка</div>
        <div class="card sound"><div class="name">{d().voice!.split('/').pop()}</div><Waveform url={fileUrl(d().voice!)} progress={p.ctx.player.t() / Math.max(1, d().duration)} onSeek={k => p.ctx.player.seek(k * d().duration)} /></div>
      </Show>
      <div class="group-h">Музыка</div>
      <Show when={d().music} fallback={<div class="muted">{d().config?.music === 'none' ? 'выключена (music: none)' : 'нет'}</div>}>
        <div class="card sound"><div class="name">{d().music!.split('/').pop()}</div><Waveform url={fileUrl(d().music!)} /></div>
      </Show>
      <div class="group-h">Картинки и обои в ролике · {d().assets.length}</div>
      <div class="mini-grid">
        <For each={d().assets}>{a => <button class="mini" title={a} onClick={() => copy(a)}><img src={fileUrl(a)} loading="lazy" alt="" /><span>{a.split('/').pop()}</span></button>}</For>
      </div>
      <div class="group-h">video.json</div>
      <pre class="pre">{JSON.stringify(d().config ?? {}, null, 2)}</pre>
    </div>
  );
}
