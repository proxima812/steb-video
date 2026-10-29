import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { annotate, attr, classList, editableRuns, insertHTML, outer, parse, pathAfter, plainText, removeNode, replaceNode, scenes, setAttr, setStyle, setText, setWall, styleDecls, toggleClass, uniqueId } from './source';

const PAGE = `<!doctype html>
<html><head><base href="../../engine/">
<!-- <section class="s">в комментарии</section> -->
<style>.x>section{color:red}</style>
<script>const s = "<section>" + '</div>'; if (a < b && c > d) {}</script>
</head><body class="p5w">
<section class="s white pal-sky" data-s="0" data-e="3" data-camk="1 #a 1.1 .8" my-attr='keep "this"'>
  <div class="h" id="a" data-lines="0.1,0.3">Заголовок <span class="acc">акцент</span> &rarr; конец</div>
  <img class="pic" src="../video/x.png">
  <custom-el foo=bar><p>Абзац без закрытия
  <div class="card" style="padding:40px 50px;background:url('a;b.png')">Текст</div></custom-el>
</section>
<section class="s black outro" data-s="3" data-e="5.5"></section>
<script>init()</script>
</body></html>`;

test('разбор: сцены, пути, комментарии и скрипты не считаются', () => {
  const d = parse(PAGE);
  expect(d.sections.length).toBe(2);
  expect(scenes(d).map(s => [s.s, s.e, s.bg, s.pal, s.outro])).toEqual([[0, 3, 'white', 'sky', false], [3, 5.5, 'black', '', true]]);
  const h = d.byPath.get('s0.0')!;
  expect(classList(h)).toEqual(['h']);
  expect(attr(d.sections[0], 'my-attr')).toBe('keep "this"');
  expect(d.byPath.get('s0.1')!.tag).toBe('img');
  expect(d.byPath.get('s0.2')!.tag).toBe('custom-el');
  // незакрытый <p> заканчивается вместе с родителем, карточка внутри него
  expect(d.byPath.get('s0.2.0.0')!.tag).toBe('div');
  expect(plainText(h)).toBe('Заголовок акцент → конец');
});

test('патч атрибута меняет только свой диапазон', () => {
  const d = parse(PAGE);
  const h = d.byPath.get('s0.0')!;
  const p = setAttr(d, h, 'data-in', '1.5');
  const at = p.src.indexOf(' data-in="1.5"');
  expect(p.src.slice(0, at) + p.src.slice(at + ' data-in="1.5"'.length)).toBe(PAGE);
  const p2 = setAttr(parse(p.src), parse(p.src).byPath.get('s0.0')!, 'data-in', null);
  expect(p2.src).toBe(PAGE);
});

test('текстовая правка сохраняет вложенную разметку и сущности соседних фрагментов', () => {
  const d = parse(PAGE);
  const h = d.byPath.get('s0.0')!;
  const runs = editableRuns(h);
  expect(runs.map(r => r.raw)).toEqual(['Заголовок ', 'акцент', ' &rarr; конец']);
  const p = setText(d, runs[1], 'другой <акцент> & "х"');
  const h2 = parse(p.src).byPath.get('s0.0')!;
  expect(outer(parse(p.src), h2)).toBe('<div class="h" id="a" data-lines="0.1,0.3">Заголовок <span class="acc">другой &lt;акцент&gt; &amp; "х"</span> &rarr; конец</div>');
  // неизмененный текст не переписывается
  expect(setText(d, runs[2], '→ конец').src).toBe(PAGE);
});

test('style: точка с запятой внутри url не делит объявления; правка свойства', () => {
  expect(styleDecls("padding:40px 50px;background:url('a;b.png')")).toEqual([{ prop: 'padding', value: '40px 50px' }, { prop: 'background', value: "url('a;b.png')" }]);
  const d = parse(PAGE), card = d.byPath.get('s0.2.0.0')!;
  const p = setStyle(d, card, { padding: '20px', 'font-size': '60px' });
  expect(p.src).toContain(`style="padding:20px;background:url('a;b.png');font-size:60px"`);
});

test('вставка и удаление: пути и соседние байты', () => {
  const d = parse(PAGE), sec = d.sections[0];
  const p = insertHTML(d, sec, '<div class="p" data-in="1">Новый</div>', 'append');
  expect(pathAfter(p.src, p.at)).toBe('s0.3');
  expect(p.src).toContain('</custom-el>\n  <div class="p" data-in="1">Новый</div>\n</section>');
  const d2 = parse(p.src);
  const back = removeNode(d2, d2.byPath.get('s0.3')!);
  expect(back.src).toBe(PAGE);
  const after = insertHTML(d, d.byPath.get('s0.0')!, '<i class="mi">memory</i>', 'after');
  expect(pathAfter(after.src, after.at)).toBe('s0.1');
  expect(parse(after.src).byPath.get('s0.2')!.tag).toBe('img');
  // пустая сцена
  const outro = d.sections[1];
  const q = insertHTML(d, outro, '<div>x</div>', 'append');
  expect(pathAfter(q.src, q.at)).toBe('s1.0');
});

test('разметка для превью не меняет исходник и дает пути', () => {
  const d = parse(PAGE);
  const a = annotate(d);
  expect(a).toContain('<section data-studio-id="s0" class="s white pal-sky"');
  expect(a).toContain('<span data-studio-id="s0.0.0" class="acc">');
  expect(a).not.toContain('data-studio-id="s0.0.0"><section');
  expect(a.replace(/ data-studio-id="[^"]*"/g, '')).toBe(PAGE);
  expect(d.src).toBe(PAGE);
});

test('классы, id, обои, замена фрагмента', () => {
  const d = parse(PAGE);
  expect(toggleClass(d, d.byPath.get('s0.2.0.0')!, 'glass', true).src).toContain('class="card glass"');
  expect(uniqueId(d, 'a')).toBe('a2');
  const w = setWall(d, d.sections[1], 'video/wallpapers/w.jpg');
  expect(w).toContain('<section class="s black outro wall" data-s="3" data-e="5.5" style="--wall:url(../../video/wallpapers/w.jpg)">');
  const r = replaceNode(d, d.byPath.get('s0.1')!, '<img class="pic" src="../video/y.png">');
  expect(r.src.replace('y.png', 'x.png')).toBe(PAGE);
});

const REAL = new URL('../../../video/1-design-rules-test/v.html', import.meta.url);
test.skipIf(!existsSync(REAL))('реальный v.html проекта (только чтение): разбор и пустой патч без изменений', () => {
  const src = readFileSync(REAL, 'utf8');
  const d = parse(src);
  expect(d.sections.length).toBe(7);
  expect(annotate(d).replace(/ data-studio-id="[^"]*"/g, '')).toBe(src);
  for (const n of d.byPath.values()) for (const r of editableRuns(n)) expect(setText(d, r, r.raw.trim().replace(/&rarr;/g, '→').replace(/&mdash;/g, '—')).src).toBe(src);
});
