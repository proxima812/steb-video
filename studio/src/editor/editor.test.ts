import { expect, test } from 'bun:test';
import * as H from './history';
import { checkCam, parseCam, preset, writeCam } from './camera';
import { check, fit, scanTimes, summarize, TEXT_ZONE, type Item } from './safety';
import { checkScenes, nearestWord, resolveTr, type Word } from './timing';
import { diagnose } from './diagnostics';
import { CATALOG as BASE_CATALOG, defaults } from './catalog';
import { KIT_CATALOG } from './catalog-kit';
const CATALOG = [...BASE_CATALOG, ...KIT_CATALOG];
import { parse, scenes } from './source';

test('история: undo/redo, слияние набора, лимит', () => {
  let h = H.start('a');
  h = H.push(h, 'ab', 'текст', 'f', 1000);
  h = H.push(h, 'abc', 'текст', 'f', 1300);
  expect(h.past.length).toBe(1);
  h = H.push(h, 'abcd', 'текст', 'f', 3000);
  expect(h.past.length).toBe(2);
  h = H.undo(h); expect(h.present.src).toBe('abc');
  h = H.undo(h); expect(h.present.src).toBe('a');
  h = H.undo(h); expect(h.present.src).toBe('a');
  h = H.redo(h); expect(h.present.src).toBe('abc');
  h = H.push(h, 'x', 'новая ветка'); expect(h.future.length).toBe(0);
  let big = H.start('0');
  for (let i = 1; i <= H.LIMIT + 20; i++) big = H.push(big, String(i), 'шаг');
  expect(big.past.length).toBe(H.LIMIT);
  expect(H.push(big, big.present.src, 'тот же')).toBe(big);
  const r = H.reset(H.push(H.start('a'), 'b', 'x', 'k', 1), 'c', 'диск');
  expect(r.present.src).toBe('c'); expect(H.undo(r).present.src).toBe('b');
});

test('камера: разбор и запись без потерь, пресеты, проверки', () => {
  const v = '1.5 #n0 1.12 .8; 3.1 c 1 .8; 5 #x 1.1 1 quint';
  expect(writeCam(parseCam(v))).toBe(v);
  expect(writeCam(parseCam('2 #a 1.1'))).toBe('2 #a 1.1');
  const keys = preset('detail-result', 1, 5, ['#a', '#b']);
  expect(keys.map(k => k.target)).toEqual(['#a', '#b', 'c']);
  expect(keys.every((k, i) => !i || k.t > keys[i - 1].t)).toBe(true);
  const issues = checkCam(parseCam('0.2 #a 1.5 2; 9 #zz 1.1 1'), { sceneStart: 0, sceneEnd: 5, trDur: .9, exists: t => t === '#a' });
  const msgs = issues.map(i => i.msg).join(' | ');
  expect(msgs).toContain('во время перехода');
  expect(msgs).toContain('1.08-1.2');
  expect(msgs).toContain('0.5-1.4');
  expect(msgs).toContain('вне сцены');
  expect(msgs).toContain('нет цели #zz');
});

const it = (id: string, kind: 'text' | 'comp', r: [number, number, number, number], anc: string[] = [], order = 0, z = 0): Item =>
  ({ id, kind, rect: { x0: r[0], y0: r[1], x1: r[2], y1: r[3] }, label: id, order, z, ancestors: anc });

test('safe zone: текст и компоненты, исключение предка, пересечения', () => {
  const issues = check(1, [
    it('ok', 'text', [65, 250, 1015, 400]),
    it('top', 'text', [100, 200, 500, 300]),
    it('cardTall', 'comp', [65, 100, 1015, 1900]),           // компонент выше зоны текста - допустимо
    it('wide', 'comp', [40, 600, 1015, 700]),
    it('inCard', 'text', [100, 120, 400, 180], ['cardTall']), // текст внутри карточки - не пересечение, но вне зоны текста
    it('over', 'comp', [300, 260, 600, 380], [], 5),          // компонент поверх текста ok
    it('off', 'text', [-900, 300, -100, 400]),                // вне кадра целиком - не видно
  ]);
  const by = (id: string, kind: string) => issues.filter(i => i.id === id && i.kind === kind);
  expect(by('ok', 'text-zone')).toHaveLength(0);
  expect(by('top', 'text-zone')[0].msg).toContain('сверху 50px');
  expect(by('cardTall', 'comp-zone')).toHaveLength(0);
  expect(by('wide', 'comp-zone')[0].msg).toContain('слева 25px');
  expect(by('inCard', 'overlap').filter(i => i.other === 'cardTall')).toHaveLength(0);
  const ov = issues.find(i => i.id === 'ok' && i.other === 'over')!;
  expect(ov.msg).toContain('может быть перекрыт');
  expect(by('off', 'text-zone')).toHaveLength(0);
  const sum = summarize([...issues, ...check(1.2, [it('top', 'text', [100, 200, 500, 300])])]);
  const top = sum.find(i => i.id === 'top')!;
  expect([top.frames, top.t, top.last]).toEqual([2, 1, 1.2]);
});

test('вместить: сдвиг и ширина', () => {
  expect(fit({ x0: 100, y0: 300, x1: 500, y1: 400 }, TEXT_ZONE)).toBeNull();
  expect(fit({ x0: 40, y0: 300, x1: 500, y1: 400 }, TEXT_ZONE)).toEqual({ dx: 25, dy: 0, width: null });
  expect(fit({ x0: 0, y0: 1600, x1: 1080, y1: 1700 }, TEXT_ZONE)).toEqual({ dx: 65, dy: -30, width: 950 });
});

test('времена проверки: шаг, ключевые моменты, без дублей', () => {
  const ts = scanTimes(0, 1, .2, [.5, .4, 2]);
  expect(ts[0]).toBe(0);
  expect(ts).toContain(.5);
  expect(ts).not.toContain(2);
  expect(ts.filter(t => Math.abs(t - .4) < 1e-6)).toHaveLength(1);
  expect(ts.at(-1)!).toBeLessThan(1);
});

const PAGE = (body: string) => `<html><head><base href="../../engine/"></head><body class="p5w">${body}</body></html>`;
test('переходы: выбор движка, повторы, dissolve между фонами', () => {
  const d = parse(PAGE(`
<section class="s white pal-sky" data-s="0" data-e="2"></section>
<section class="s white pal-sky" data-s="2" data-e="4"></section>
<section class="s white pal-red" data-s="4" data-e="6" data-tr="down"></section>
<section class="s white pal-blue" data-s="6" data-e="8" data-tr="down"></section>
<section class="s black pal-lime" data-s="8" data-e="10" data-tr="dissolve"></section>
<section class="s black pal-lime" data-s="10" data-e="12" data-tr="wipe"></section>`));
  const sc = scenes(d);
  expect([1, 2, 3, 4, 5].map(i => resolveTr(sc, i))).toEqual(['down', 'down', 'down', 'dissolve', 'down']);
  const msgs = checkScenes(sc, () => true).map(i => i.msg).join(' | ');
  expect(msgs).toContain('переход down 3 раза подряд');
  expect(msgs).toContain('палитра sky как в соседней сцене');
  expect(msgs).toContain('dissolve между разными фонами');
  expect(msgs).toContain('«wipe» движок заменит на down');
  expect(msgs).toContain('4 сцены подряд на фоне white');
  expect(msgs).toContain('не концовка');
  const w: Word[] = [['а', 1, 1.2], ['б', 2, 2.3]];
  expect(nearestWord(w, 1.8)).toBe(1);
});

test('диагностика правил по исходнику', () => {
  const d = parse(PAGE(`<section class="s white pal-sky" data-s="0" data-e="3" data-camk="0.1 #nope 1.3 3" data-punch="1:.05">
  <div class="h" style="letter-spacing:2px">Всё — плохо</div><div data-in="5" data-a="zoom" data-sfx="pop" data-float="4">x</div></section>`));
  const msgs = diagnose(d).map(x => x.msg).join(' | ');
  for (const m of ['буква ё', 'длинное тире', 'положительный трекинг', 'data-sfx', 'data-a="zoom"', 'data-float', 'вне сцены', 'нет цели #nope', 'акцент больше 2%', 'не концовка']) expect(msgs).toContain(m);
  expect(diagnose(parse('<html><body><section data-s="0" data-e="1"></section></body></html>')).some(x => x.msg.includes('<base'))).toBe(true);
});

test('каталог: каждый компонент дает разбираемый HTML без ё и длинных тире, с входом от текущего времени', () => {
  for (const c of CATALOG) for (const v of c.variants) {
    const vals = defaults(c);
    if (c.fields.some(f => f.type === 'asset')) vals.src = 'video/assets/images/a b.png';
    vals.text = (vals.text ?? '') + ' ёлка — тест';
    const html = c.build(vals, v.id, { t: 1.25, id: b => b });
    const d = parse(`<section>${html}</section>`);
    expect(d.sections[0].children.length).toBeGreaterThan(0);
    expect(html).not.toMatch(/[ёЁ—–]/);
    expect(html).toContain('1.25');
    if (c.id === 'formula') expect(html).toMatch(/<!--tex .*--><!--\/tex-->/);
    if (c.id === 'image') expect(html).toContain('a%20b.png');
  }
});
