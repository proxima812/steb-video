import { createSignal, For, onCleanup, Show } from 'solid-js';
import { api, Assets, fmtSize, VideoSummary } from '../api';

const kinds: [keyof Assets, string][] = [['images', 'Картинки'], ['wallpapers', 'Обои'], ['avatars', 'Аватары'], ['voices', 'Озвучка'], ['music', 'Музыка'], ['sfx', 'Звуки']];
type Item = { file: File; state: string; done?: boolean; error?: boolean };
export default function Upload(p: { kind?: string; video?: string; videos?: VideoSummary[]; onDone: () => void; onPending?: (pending: boolean) => void }) {
  const [kind, setKind] = createSignal(p.kind || 'images');
  const [destination, setDestination] = createSignal(p.video || '');
  const [items, setItems] = createSignal<Item[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [drag, setDrag] = createSignal(false);
  const local = () => ['images', 'voices', 'music'].includes(kind());
  let active = true;
  onCleanup(() => { active = false; p.onPending?.(false); });
  const pending = () => active && p.onPending?.(busy() || items().some(i => !i.done));
  function add(files: File[]) {
    if (busy()) return;
    setItems(old => [...old, ...files.map(file => ({ file, state: 'В очереди' }))]); pending();
  }
  async function upload() {
    if (busy()) return;
    setBusy(true); pending();
    let changed = false;
    try {
      for (let i = 0; i < items().length; i++) {
        if (items()[i].done) continue;
        const update = (patch: Partial<Item>) => setItems(all => all.map((item, j) => j === i ? { ...item, ...patch } : item));
        update({ state: 'Загружается...', error: false });
        try {
          const result = await api.upload(items()[i].file, kind(), local() ? destination() : '');
          update({ state: `Сохранено: ${result.name}`, done: true }); changed = true;
        } catch (e: any) { update({ state: e.message, error: true }); }
      }
      if (changed) p.onDone();
    } finally { setBusy(false); pending(); }
  }
  return <div class="card">
    <b>Добавить материал</b>
    <div class="fields">
      <label>Категория<select disabled={busy()} value={kind()} onChange={e => setKind(e.currentTarget.value)}>
        <For each={kinds}>{([key, label]) => <option value={key}>{label}</option>}</For>
      </select></label>
      <label>Куда сохранить<select disabled={busy() || !local() || !!p.video} value={local() ? destination() : ''} onChange={e => setDestination(e.currentTarget.value)}>
        <option value="">Общая библиотека</option>
        <Show when={p.video}><option value={p.video}>{p.video}</option></Show>
        <For each={p.videos}>{v => <option value={v.id}>{v.id}</option>}</For>
      </select></label>
    </div>
    <label class="note-box" onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); add(Array.from(e.dataTransfer?.files || [])); }}>
      <div>{drag() ? 'Отпустите файлы здесь' : 'Перетащите файлы сюда или выберите на компьютере'}</div>
      <input aria-label="Файлы для загрузки" type="file" multiple disabled={busy()}
        accept={['voices', 'music', 'sfx'].includes(kind()) ? '.mp3,.wav,.m4a,.flac,.ogg' : '.png,.jpg,.jpeg,.webp,.gif,.avif'}
        onChange={e => { add(Array.from(e.currentTarget.files || [])); e.currentTarget.value = ''; }} />
      <div class="muted">До 100 МБ на файл. При совпадении имени добавится номер.</div>
    </label>
    <For each={items()}>{item => <div class="row">
      <div class="grow"><div class="name">{item.file.name} · {fmtSize(item.file.size)}</div><div role={item.error ? 'alert' : 'status'}>{item.state}</div></div>
      <button class="btn ghost" disabled={busy()} onClick={() => { setItems(all => all.filter(x => x !== item)); pending(); }}>Убрать</button>
    </div>}</For>
    <button class="btn primary" disabled={busy() || !items().some(i => !i.done)} onClick={upload}>{busy() ? 'Загрузка...' : 'Загрузить материалы'}</button>
  </div>;
}
