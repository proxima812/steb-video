// Проверки исходника по правилам проекта (AGENTS.md): без браузера, по тексту черновика.
import { checkCam, parseCam } from './camera';
import { attr, decode, scenes, styleDecls, type Doc } from './source';
import { checkScenes, resolveTr, trDur } from './timing';

export type Diag = { level: 'error' | 'warn'; msg: string; scene: number; path: string | null; t: number | null; area: 'текст' | 'сцены' | 'камера' | 'движение' | 'файл' };

export function diagnose(d: Doc): Diag[] {
  const out: Diag[] = [];
  if (!/<base\s+href="\.\.\/\.\.\/engine\/"/.test(d.src)) out.push({ level: 'error', area: 'файл', msg: 'нет <base href="../../engine/"> из шаблона', scene: -1, path: null, t: null });
  if (!/class="[^"]*\bp5w\b/.test(d.src)) out.push({ level: 'warn', area: 'файл', msg: 'body без класса p5w (пресет default)', scene: -1, path: null, t: null });
  const sc = scenes(d), info = sc;
  for (const node of d.byPath.values()) {
    if (node.tag === 'script' || node.tag === 'style') continue;
    for (const r of node.texts) {
      const v = decode(r.raw);
      if (/[ёЁ]/.test(v)) out.push({ level: 'warn', area: 'текст', msg: `буква ё: «${v.trim().slice(0, 30)}»`, scene: node.section, path: node.path, t: null });
      if (/[—–]/.test(v)) out.push({ level: 'warn', area: 'текст', msg: `длинное тире: «${v.trim().slice(0, 30)}»`, scene: node.section, path: node.path, t: null });
    }
    const ls = styleDecls(attr(node, 'style') || '').find(x => x.prop === 'letter-spacing');
    if (ls && parseFloat(ls.value) > 0) out.push({ level: 'error', area: 'текст', msg: `положительный трекинг ${ls.value}`, scene: node.section, path: node.path, t: null });
    if (attr(node, 'data-sfx') != null) out.push({ level: 'warn', area: 'движение', msg: 'data-sfx: звуковые эффекты в роликах не используем', scene: node.section, path: node.path, t: null });
    const a = attr(node, 'data-a');
    if (a && ['zoom', 'pop', 'spin', 'flip', 'soft', 'zdrop'].includes(a)) out.push({ level: 'warn', area: 'движение', msg: `data-a="${a}": в p5w заменяется сдвигом, лучше rise`, scene: node.section, path: node.path, t: +(attr(node, 'data-in') ?? NaN) || null });
    for (const k of ['data-float', 'data-shake', 'data-rot3d', 'data-turn', 'data-spin'])
      if (attr(node, k) != null) out.push({ level: 'warn', area: 'движение', msg: `${k}: покачивания, тряска и вращения запрещены`, scene: node.section, path: node.path, t: null });
    const tin = attr(node, 'data-in'), sec = info[node.section];
    if (tin != null && sec && node.tag !== 'section' && (+tin < sec.s - .01 || +tin >= sec.e)) out.push({ level: 'warn', area: 'движение', msg: `вход ${tin} с вне сцены ${sec.s}-${sec.e}`, scene: node.section, path: node.path, t: +tin });
    const ex = attr(node, 'data-exit');
    if (ex != null && tin != null && +ex.split(',')[0] <= +tin) out.push({ level: 'warn', area: 'движение', msg: 'уход раньше входа', scene: node.section, path: node.path, t: +ex.split(',')[0] });
  }
  // сцены и переходы
  const imgIds = (i: number, sel: string) => [...d.byPath.values()].some(n => n.section === i && n.tag === 'img' && '#' + attr(n, 'id') === sel);
  for (const x of checkScenes(sc, imgIds)) out.push({ level: x.level, area: 'сцены', msg: x.msg, scene: x.scene, path: sc[x.scene]?.path ?? null, t: sc[x.scene]?.s ?? null });
  // камера
  sc.forEach((x, i) => {
    const keys = parseCam(attr(d.sections[i], 'data-camk'));
    const ids = new Set([...d.byPath.values()].filter(n => n.section === i).map(n => '#' + attr(n, 'id')));
    for (const c of checkCam(keys, { sceneStart: x.s, sceneEnd: x.e, trDur: i ? trDur(resolveTr(sc, i)) : 0, exists: tg => !tg.startsWith('#') || ids.has(tg) }))
      out.push({ level: c.level, area: 'камера', msg: `ключ ${keys[c.key].t}: ${c.msg}`, scene: i, path: x.path, t: keys[c.key].t });
    const punch = (attr(d.sections[i], 'data-punch') || '').split(',').filter(Boolean);
    for (const pz of punch) { const [, amt] = pz.split(':'); if (amt && +amt > .02) out.push({ level: 'warn', area: 'камера', msg: `data-punch ${pz}: акцент больше 2%`, scene: i, path: x.path, t: +pz.split(':')[0] }); }
  });
  const punches = sc.reduce((n, _x, i) => n + (attr(d.sections[i], 'data-punch') || '').split(',').filter(Boolean).length, 0);
  if (punches > 4) out.push({ level: 'warn', area: 'камера', msg: `data-punch ${punches} раз за ролик (норма 3-4)`, scene: -1, path: null, t: null });
  // uppercase
  const upper = [...d.byPath.values()].filter(n => /text-transform:\s*uppercase/.test(attr(n, 'style') || '') || (attr(n, 'class') || '').split(/\s+/).includes('up')).length;
  if (upper > 3) out.push({ level: 'warn', area: 'текст', msg: `uppercase ${upper} раз (не больше 2-3)`, scene: -1, path: null, t: null });
  return out;
}
