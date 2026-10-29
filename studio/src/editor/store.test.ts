// Состояние черновика: смена ролика, сохранение во время правок, перенос скрытия/блокировки/выбора, непримененая правка.
// store реактивен: в bun по умолчанию подключается серверная сборка solid-js без реактивности, поэтому берем браузерную.
import { expect, mock, test } from 'bun:test';
mock.module('solid-js', () => require('../../node_modules/solid-js/dist/solid.js'));
const { createRoot } = await import('solid-js');
const { createDraftStore } = await import('./store');
const { saveDraft } = await import('./save');
const { filterTracks, dirFromOption, dirOption, ALL_DIRS } = await import('../music-filter');
const { insertHTML, removeNode, setAttr } = await import('./source');

const PAGE = (body: string) => `<html><body>\n<section class="s" data-s="0" data-e="5">\n${body}\n</section>\n</body></html>`;
const A = PAGE('  <div class="a">A</div>\n  <div class="b">B</div>\n  <div class="c">C</div>');
const inRoot = <T>(fn: () => Promise<T> | T) => createRoot(dispose => Promise.resolve(fn()).finally(dispose));
const pathOf = (s: ReturnType<typeof createDraftStore>, cls: string) => [...s.doc().byPath.values()].find(n => n.attrs.some(a => a.name === 'class' && a.value === cls))?.path ?? null;

test('смена ролика: история, выбор, скрытие и база с нуля, undo не возвращает HTML прежнего ролика', () => inRoot(() => {
  const s = createDraftStore();
  s.open(A);
  s.apply(d => setAttr(d, d.byPath.get(pathOf(s, 'a')!)!, 'id', 'x'), 'id');
  s.toggleHide(pathOf(s, 'b')!); s.setSel(pathOf(s, 'c'));
  s.open(null);
  expect(s.dirty()).toBe(false);
  const B = PAGE('  <p>другой ролик</p>');
  s.open(B);
  expect(s.canUndo()).toBe(false);
  s.undo();
  expect(s.draft()).toBe(B);
  expect(s.hidden().size).toBe(0);
  expect(s.sel()).toBeNull();
}));

test('сохранение: правки во время запроса остаются в черновике и истории, база - сохраненный текст', () => inRoot(async () => {
  const s = createDraftStore();
  s.open(A);
  s.apply(d => setAttr(d, d.byPath.get(pathOf(s, 'a')!)!, 'id', 'one'), 'первая');
  const sent = s.draft();
  let finish!: (v: { ok: true }) => void;
  const put = (html: string, base: string) => { expect(html).toBe(sent); expect(base).toBe(A); return new Promise<{ ok: true }>(r => finish = r); };
  const saving = saveDraft(s, put, { current: () => true });
  s.apply(d => setAttr(d, d.byPath.get(pathOf(s, 'b')!)!, 'id', 'two'), 'вторая');
  const newer = s.draft(), steps = s.hist().past.length;
  finish({ ok: true });
  expect(await saving).toEqual({ ok: true });
  expect(s.draft()).toBe(newer);
  expect(s.base()).toBe(sent);
  expect(s.dirty()).toBe(true);
  expect(s.hist().past.length).toBe(steps);
  s.undo();
  expect(s.draft()).toBe(sent);
  expect(s.dirty()).toBe(false);
}));

test('сохранение: ответ для прежнего ролика не трогает черновик нового', () => inRoot(async () => {
  const s = createDraftStore();
  s.open(A);
  s.commit(A + '<!-- x -->', 'x');
  let finish!: () => void;
  let id = 'old';
  const saving = saveDraft(s, () => new Promise<string>(r => finish = () => r('ok')), { current: () => id === 'old' });
  id = 'new'; const B = PAGE('<p>B</p>'); s.open(B);
  finish();
  expect(await saving).toBeNull();
  expect(s.base()).toBe(B);
  expect(s.draft()).toBe(B);
}));

test('скрытие и блокировка не переходят на соседний объект после удаления, вставки, undo и redo', () => inRoot(() => {
  const s = createDraftStore();
  s.open(A);
  const b0 = pathOf(s, 'b')!, c0 = pathOf(s, 'c')!;
  s.toggleHide(b0); s.toggleLock(c0);
  // удаление соседа перед ними: пути сдвигаются, привязка сохраняется
  s.apply(d => removeNode(d, d.byPath.get(pathOf(s, 'a')!)!), 'удалить A');
  expect([...s.hidden()]).toEqual([pathOf(s, 'b')!]);
  expect([...s.locked()]).toEqual([pathOf(s, 'c')!]);
  s.undo();
  expect([...s.hidden()]).toEqual([b0]);
  expect([...s.locked()]).toEqual([c0]);
  // вставка перед скрытым
  s.apply(d => insertHTML(d, d.byPath.get(pathOf(s, 'a')!)!, '<div class="n">N</div>', 'after'), 'вставка');
  expect([...s.hidden()]).toEqual([pathOf(s, 'b')!]);
  expect(pathOf(s, 'b')).not.toBe(b0);
  // удаление самого скрытого объекта: скрытие снимается, соседний C не скрыт
  let dropped = 0;
  const s2 = createDraftStore({ onDropped: n => dropped += n });
  s2.open(A);
  s2.toggleHide(pathOf(s2, 'b')!);
  s2.apply(d => removeNode(d, d.byPath.get(pathOf(s2, 'b')!)!), 'удалить B');
  expect(s2.hidden().size).toBe(0);
  expect(dropped).toBe(1);
  // правка атрибута скрытого объекта не снимает скрытие
  s2.toggleHide(pathOf(s2, 'c')!);
  s2.apply(d => setAttr(d, d.byPath.get(pathOf(s2, 'c')!)!, 'data-in', '1'), 'вход');
  expect([...s2.hidden()]).toEqual([pathOf(s2, 'c')!]);
}));

test('выбор и непримененая правка исходника идут за своим объектом', () => inRoot(() => {
  const s = createDraftStore();
  s.open(A);
  const c = pathOf(s, 'c')!;
  s.setSel(c);
  s.setPendingSrc({ path: c, orig: '<div class="c">C</div>', text: '<div class="c">C2</div>' });
  s.apply(d => removeNode(d, d.byPath.get(pathOf(s, 'a')!)!), 'удалить A');
  expect(s.sel()).toBe(pathOf(s, 'c'));
  expect(s.pendingSrc()!.path).toBe(pathOf(s, 'c'));
  s.apply(d => removeNode(d, d.byPath.get(pathOf(s, 'c')!)!), 'удалить C');
  expect(s.sel()).toBeNull();
  expect(s.pendingSrc()).toEqual({ path: null, orig: '<div class="c">C</div>', text: '<div class="c">C2</div>' }); // текст не теряется
}));

// близнецы - одинаковый HTML подряд: при удалении/вставке текст не говорит, какой из них затронут
const TW = PAGE('  <p class="t">A</p>\n  <p class="t">A</p>\n  <div class="b">B</div>');
const twins = (s: ReturnType<typeof createDraftStore>) => [...s.doc().byPath.values()].filter(n => n.attrs.some(a => a.value === 't')).map(n => n.path!);

for (const k of [0, 1]) test(`удаление ${k ? 'второго' : 'первого'} близнеца: состояние близнецов сбрасывается, а не переходит на оставшегося`, () => inRoot(() => {
  let dropped = 0;
  const s = createDraftStore({ onDropped: n => dropped += n });
  s.open(TW);
  const [t0, t1] = twins(s), b = pathOf(s, 'b')!;
  s.toggleHide(t0); s.toggleLock(t1); s.toggleHide(b); s.toggleLock(b);
  s.setSel(twins(s)[k]);
  const orig = '<p class="t">A</p>', text = '<p class="t">A2</p>';
  s.setPendingSrc({ path: twins(s)[k], orig, text });
  s.apply(d => removeNode(d, d.byPath.get(twins(s)[k])!), 'удалить близнеца');
  const [left] = twins(s);
  expect(twins(s).length).toBe(1);
  expect(s.hidden().has(left)).toBe(false);
  expect(s.locked().has(left)).toBe(false);
  expect(s.sel()).toBeNull();
  expect(s.pendingSrc()).toEqual({ path: null, orig, text }); // непримененая правка не применится к близнецу
  // уникальный объект сохраняет привязку
  expect([...s.hidden()]).toEqual([pathOf(s, 'b')!]);
  expect([...s.locked()]).toEqual([pathOf(s, 'b')!]);
  expect(dropped).toBe(2);
  // undo/redo не возвращают сброшенное состояние на кого-то из близнецов
  s.undo();
  expect(s.draft()).toBe(TW);
  expect(twins(s).some(t => s.hidden().has(t) || s.locked().has(t))).toBe(false);
  expect([...s.hidden()]).toEqual([b]);
  expect(s.pendingSrc()!.path).toBeNull();
  s.redo();
  expect(twins(s).some(t => s.hidden().has(t) || s.locked().has(t))).toBe(false);
  expect([...s.locked()]).toEqual([pathOf(s, 'b')!]);
}));

test('вставка одинакового соседа: выбор и правка исходника не угадывают близнеца, уникальный объект идет за собой', () => inRoot(() => {
  const s = createDraftStore();
  const one = PAGE('  <p class="t">A</p>\n  <div class="b">B</div>');
  s.open(one);
  const t = twins(s)[0], b = pathOf(s, 'b')!;
  s.toggleHide(t); s.setSel(t); s.toggleLock(b);
  s.setPendingSrc({ path: t, orig: '<p class="t">A</p>', text: '<p class="t">A2</p>' });
  s.apply(d => insertHTML(d, d.byPath.get(t)!, '<p class="t">A</p>', 'after'), 'дубль');
  expect(twins(s).length).toBe(2);
  expect(s.hidden().size).toBe(0);
  expect(s.sel()).toBeNull();
  expect(s.pendingSrc()!.path).toBeNull();
  expect([...s.locked()]).toEqual([pathOf(s, 'b')!]);
  s.undo();
  expect(s.draft()).toBe(one);
  expect([...s.locked()]).toEqual([b]);
  expect(s.hidden().size).toBe(0);
}));

test('однозначная правка одного близнеца: его состояние остается на нем, второй не затронут', () => inRoot(() => {
  const s = createDraftStore();
  s.open(TW);
  const [t0, t1] = twins(s);
  s.toggleHide(t1); s.setSel(t1);
  s.setPendingSrc({ path: t1, orig: '<p class="t">A</p>', text: 'x' });
  s.apply(d => setAttr(d, d.byPath.get(t1)!, 'data-in', '1'), 'вход');
  expect([...s.hidden()]).toEqual([t1]);
  expect(s.sel()).toBe(t1);
  expect(s.pendingSrc()!.path).toBe(t1); // путь тот же, но HTML изменился - применение откажет по orig
  s.undo();
  expect([...s.hidden()]).toEqual([t1]);
  expect(s.hidden().has(t0)).toBe(false);
}));

test('музыка: «(корень)» и «Все папки» различаются', () => {
  const t = (p: string, dir: string) => ({ path: p, name: p, dir, size: 1, mtime: 0 });
  const tracks = [t('a.mp3', ''), t('OST oppenheimer/b.mp3', 'OST oppenheimer')];
  expect(filterTracks(tracks, ALL_DIRS, '')).toHaveLength(2);
  expect(filterTracks(tracks, dirFromOption(dirOption('')), '').map(x => x.path)).toEqual(['a.mp3']);
  expect(dirOption('')).not.toBe(dirOption(ALL_DIRS));
  expect(filterTracks(tracks, dirFromOption(dirOption('OST oppenheimer')), 'b').map(x => x.path)).toEqual(['OST oppenheimer/b.mp3']);
  expect(dirFromOption(dirOption(ALL_DIRS))).toBe(ALL_DIRS);
});
