import { createSignal, For, Show } from 'solid-js';
import { api, fileUrl, fmtTime, VideoSummary } from '../api';
import { protectDraft } from '../guard';

export default function Videos(p: { videos?: VideoSummary[]; onCreated: () => void }) {
  const [open, setOpen] = createSignal(false);
  const [title, setTitle] = createSignal('');
  const [script, setScript] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal('');
  const [query, setQuery] = createSignal('');
  protectDraft(() => busy() || !!title().trim() || !!script().trim());
  async function create(e: SubmitEvent) {
    e.preventDefault(); if (busy()) return;
    setBusy(true); setError('');
    try {
      const video = await api.createVideo(title(), script());
      setTitle(''); setScript(''); setBusy(false); p.onCreated();
      location.hash = '#/v/' + encodeURIComponent(video.id);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  return (
    <div class="page">
      <div class="toolbar"><h1 class="title grow">Ролики</h1><button class="btn primary" onClick={() => setOpen(true)}>Создать ролик</button></div>
      <Show when={open()}>
        <form class="pane card" onSubmit={create}>
          <b>Новый ролик</b>
          <div class="fields">
            <label class="wide">Название<input required maxLength={100} disabled={busy()} value={title()} onInput={e => setTitle(e.currentTarget.value)} placeholder="Например: Почему ИИ путает слова" /></label>
            <label class="wide">Сценарий<textarea rows={6} maxLength={30000} disabled={busy()} value={script()} onInput={e => setScript(e.currentTarget.value)} placeholder="Вставьте текст озвучки. Можно добавить позже." /></label>
          </div>
          <div class="muted">Номер назначится автоматически. Создадим стартовую сцену на 5 секунд и концовку на 2.5 секунды. Сценарий сохранится отдельно; сцены и тайминги нужно подготовить перед сборкой.</div>
          <Show when={error()}><div role="alert">{error()}</div></Show>
          <div class="row"><button class="btn primary" type="submit" disabled={busy() || !title().trim()}>{busy() ? 'Создается...' : 'Создать и открыть'}</button>
          <button type="button" class="btn ghost" disabled={busy()} onClick={() => { if ((!title() && !script()) || confirm('Отменить создание и убрать введенный текст?')) { setTitle(''); setScript(''); setOpen(false); } }}>Отмена</button></div>
        </form>
      </Show>
      <div class="toolbar"><label class="search"><span class="mi">search</span><input placeholder="Найти ролик" value={query()} onInput={e => setQuery(e.currentTarget.value)} /></label></div>
      <Show when={p.videos} fallback={<div class="empty">Загрузка...</div>}>
        <Show when={p.videos!.length} fallback={<div class="empty">В video/ нет папок с v.html</div>}>
          <div class="grid tall">
            <For each={[...p.videos!].reverse().filter(v => v.id.toLowerCase().includes(query().toLowerCase()))}>{v =>
              <a class="card video" href={`#/v/${v.id}`}>
                <div class="cover">
                  <Show when={v.cover} fallback={<div class="cover-num">{v.num || '?'}</div>}>
                    <img src={fileUrl(v.cover!) + '?m=' + v.mtime} loading="lazy" alt="" />
                  </Show>
                </div>
                <div class="name">{v.num ? `${v.num} · ` : ''}{v.slug}</div>
                <div class="meta">{fmtTime(v.duration)} · {v.scenes} сцен</div>
                <div class="used">
                  <Show when={v.hasFinal}><span class="chip ok">mp4</span></Show>
                  <Show when={v.posted}><span class="chip">опубликован</span></Show>
                </div>
              </a>}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  );
}
