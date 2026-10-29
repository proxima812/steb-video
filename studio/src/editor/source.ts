// Модель исходника v.html: разбор с позициями и локальные патчи текста.
// Ничего не нормализует: все, что вне заменяемого диапазона, остается байт в байт.
// Идентификатор объекта - путь в исходнике: s<сцена>.<индекс ребенка>.<...>.

export type Attr = { name: string; value: string | null; start: number; end: number };
export type TextRun = { start: number; end: number; raw: string };
export type SrcNode = {
  tag: string; path: string | null; section: number;
  start: number; openEnd: number; closeStart: number; end: number;
  attrs: Attr[]; children: SrcNode[]; texts: TextRun[]; parent: SrcNode | null;
  /** закрыт ли элемент явно (void и самозакрытые - true) */
  closed: boolean;
};
export type Doc = { src: string; root: SrcNode; sections: SrcNode[]; byPath: Map<string, SrcNode> };

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'textarea', 'title']);

export function parse(src: string): Doc {
  const root: SrcNode = { tag: '#root', path: null, section: -1, start: 0, openEnd: 0, closeStart: src.length, end: src.length, attrs: [], children: [], texts: [], parent: null, closed: true };
  const stack: SrcNode[] = [root];
  const top = () => stack[stack.length - 1];
  let i = 0, textFrom = 0;
  const flushText = (to: number) => {
    if (to > textFrom) top().texts.push({ start: textFrom, end: to, raw: src.slice(textFrom, to) });
  };
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt < 0) break;
    if (src.startsWith('<!--', lt)) {
      flushText(lt);
      const e = src.indexOf('-->', lt + 4);
      i = textFrom = e < 0 ? src.length : e + 3;
      continue;
    }
    if (src[lt + 1] === '!' || src[lt + 1] === '?') {
      flushText(lt);
      const e = src.indexOf('>', lt);
      i = textFrom = e < 0 ? src.length : e + 1;
      continue;
    }
    const close = /^<\/([a-zA-Z][\w:-]*)\s*>/.exec(src.slice(lt, lt + 80));
    if (close) {
      const name = close[1].toLowerCase();
      const k = stack.map(n => n.tag).lastIndexOf(name);
      if (k > 0) {
        flushText(lt);
        // незакрытые потомки заканчиваются там, где закрылся предок
        while (stack.length - 1 > k) { const n = stack.pop()!; n.closeStart = n.end = lt; }
        const n = stack.pop()!;
        n.closeStart = lt; n.end = lt + close[0].length; n.closed = true;
        i = textFrom = n.end;
      } else i = lt + close[0].length; // лишний закрывающий тег остается текстом
      continue;
    }
    const open = /^<([a-zA-Z][\w:-]*)/.exec(src.slice(lt, lt + 80));
    if (!open) { i = lt + 1; continue; }
    flushText(lt);
    const tag = open[1].toLowerCase();
    // атрибуты с учетом кавычек
    let j = lt + open[0].length;
    const attrs: Attr[] = [];
    let selfClose = false;
    while (j < src.length) {
      while (j < src.length && /\s/.test(src[j])) j++;
      if (src[j] === '>') { j++; break; }
      if (src[j] === '/' && src[j + 1] === '>') { selfClose = true; j += 2; break; }
      const m = /^[^\s=>\/"']+|^\//.exec(src.slice(j, j + 200));
      if (!m) { j++; continue; }
      if (m[0] === '/') { j++; continue; }
      const aStart = j; j += m[0].length;
      let k = j; while (k < src.length && /\s/.test(src[k])) k++;
      let value: string | null = null;
      if (src[k] === '=') {
        k++; while (k < src.length && /\s/.test(src[k])) k++;
        const q = src[k];
        if (q === '"' || q === "'") {
          const e = src.indexOf(q, k + 1);
          const ve = e < 0 ? src.length : e;
          value = decode(src.slice(k + 1, ve)); j = Math.min(src.length, ve + 1);
        } else {
          const vm = /^[^\s>]*/.exec(src.slice(k))!;
          value = decode(vm[0]); j = k + vm[0].length;
        }
      }
      attrs.push({ name: m[0], value, start: aStart, end: j });
    }
    const parent = top();
    const node: SrcNode = { tag, path: null, section: -1, start: lt, openEnd: j, closeStart: j, end: j, attrs, children: [], texts: [], parent, closed: true };
    parent.children.push(node);
    if (RAW.has(tag)) {
      const re = new RegExp(`</${tag}\\s*>`, 'ig'); re.lastIndex = j;
      const m = re.exec(src);
      node.closeStart = m ? m.index : src.length; node.end = m ? m.index + m[0].length : src.length;
      i = textFrom = node.end;
      continue;
    }
    if (selfClose || VOID.has(tag)) { i = textFrom = j; continue; }
    node.closed = false;
    stack.push(node);
    i = textFrom = j;
  }
  flushText(src.length);
  while (stack.length > 1) { const n = stack.pop()!; n.closeStart = n.end = src.length; }

  // пути: сцены по порядку документа (как querySelectorAll('section') в движке)
  const sections: SrcNode[] = [];
  const byPath = new Map<string, SrcNode>();
  const walk = (n: SrcNode, path: string | null, sec: number) => {
    n.children.forEach((c, k) => {
      let p: string | null = null, s = sec;
      if (path) p = `${path}.${k}`;
      else if (c.tag === 'section') { s = sections.length; p = `s${s}`; sections.push(c); }
      if (p) { c.path = p; c.section = s; byPath.set(p, c); }
      walk(c, p, s);
    });
  };
  walk(root, null, -1);
  return { src, root, sections, byPath };
}

// ---------- чтение ----------
export const attr = (n: SrcNode, name: string) => n.attrs.find(a => a.name.toLowerCase() === name.toLowerCase())?.value ?? null;
export const hasAttr = (n: SrcNode, name: string) => n.attrs.some(a => a.name.toLowerCase() === name.toLowerCase());
export const classList = (n: SrcNode) => (attr(n, 'class') || '').split(/\s+/).filter(Boolean);
export const outer = (d: Doc, n: SrcNode) => d.src.slice(n.start, n.end);
export const inner = (d: Doc, n: SrcNode) => d.src.slice(n.openEnd, n.closeStart);

/** все текстовые узлы элемента и его потомков в порядке документа (кроме script/style) */
export function textRuns(n: SrcNode): TextRun[] {
  if (RAW.has(n.tag)) return [];
  const items: TextRun[] = [...n.texts];
  for (const c of n.children) items.push(...textRuns(c));
  return items.sort((a, b) => a.start - b.start);
}
export const editableRuns = (n: SrcNode) => textRuns(n).filter(r => r.raw.trim());
export const plainText = (n: SrcNode) => textRuns(n).map(r => decode(r.raw)).join('').replace(/\s+/g, ' ').trim();

export function nodeAt(d: Doc, offset: number): SrcNode | null {
  let best: SrcNode | null = null;
  for (const n of d.byPath.values()) if (n.start === offset) best = n;
  return best;
}
export const ids = (d: Doc) => new Set([...d.byPath.values()].map(n => attr(n, 'id')).filter(Boolean) as string[]);
export function uniqueId(d: Doc, base: string) {
  const used = ids(d), clean = base.replace(/[^\w-]/g, '') || 'obj';
  if (!used.has(clean)) return clean;
  for (let k = 2; ; k++) if (!used.has(`${clean}${k}`)) return `${clean}${k}`;
}

// ---------- сущности ----------
const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rarr: '→', larr: '←', uarr: '↑', darr: '↓', harr: '↔',
  mdash: '—', ndash: '–', laquo: '«', raquo: '»', hellip: '…', times: '×', middot: '·', minus: '−', deg: '°', le: '≤', ge: '≥', ne: '≠', copy: '©', bull: '•',
};
export function decode(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') { const c = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1); return Number.isFinite(c) ? String.fromCodePoint(c) : m; }
    return NAMED[e.toLowerCase()] ?? m;
  });
}
export const encodeText = (s: string) => s.replace(/&(?![a-zA-Z0-9#]+;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/ /g, '&nbsp;');
export const encodeAttr = (s: string) => s.replace(/&(?![a-zA-Z0-9#]+;)/g, '&amp;').replace(/"/g, '&quot;');

// ---------- патчи ----------
export type Patch = { src: string; /** позиция начала затронутого элемента после патча */ at: number };
const splice = (s: string, a: number, b: number, ins: string) => s.slice(0, a) + ins + s.slice(b);

export function setAttr(d: Doc, n: SrcNode, name: string, value: string | null): Patch {
  const a = n.attrs.find(x => x.name.toLowerCase() === name.toLowerCase());
  const text = value == null ? '' : `${a?.name ?? name}="${encodeAttr(value)}"`;
  if (a) {
    if (value == null) {
      let s = a.start; while (s > n.start && /\s/.test(d.src[s - 1])) s--;
      return { src: splice(d.src, s, a.end, ''), at: n.start };
    }
    return { src: splice(d.src, a.start, a.end, text), at: n.start };
  }
  if (value == null) return { src: d.src, at: n.start };
  // перед ">" или "/>" открывающего тега
  let p = n.openEnd - 1;
  if (d.src[p - 1] === '/') p--;
  while (p > n.start && /\s/.test(d.src[p - 1])) p--;
  return { src: splice(d.src, p, p, ' ' + text), at: n.start };
}

export function setClasses(d: Doc, n: SrcNode, fn: (c: string[]) => string[]): Patch {
  const next = fn(classList(n));
  return setAttr(d, n, 'class', next.length ? next.join(' ') : null);
}
export const toggleClass = (d: Doc, n: SrcNode, c: string, on: boolean) =>
  setClasses(d, n, l => on ? (l.includes(c) ? l : [...l, c]) : l.filter(x => x !== c));

/** разбор style на объявления; точки с запятой внутри скобок и кавычек не делят */
export function styleDecls(style: string): { prop: string; value: string }[] {
  const out: { prop: string; value: string }[] = [];
  let depth = 0, q = '', cur = '';
  const push = () => { const k = cur.indexOf(':'); if (k > 0) out.push({ prop: cur.slice(0, k).trim(), value: cur.slice(k + 1).trim() }); else if (cur.trim()) out.push({ prop: '', value: cur.trim() }); cur = ''; };
  for (const ch of style) {
    if (q) { if (ch === q) q = ''; cur += ch; continue; }
    if (ch === '"' || ch === "'") q = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === ';' && !depth) { push(); continue; }
    cur += ch;
  }
  push();
  return out;
}
export const styleOf = (n: SrcNode, prop: string) => styleDecls(attr(n, 'style') || '').find(x => x.prop.toLowerCase() === prop)?.value ?? null;
export function setStyle(d: Doc, n: SrcNode, props: Record<string, string | null>): Patch {
  const decls = styleDecls(attr(n, 'style') || '');
  for (const [prop, value] of Object.entries(props)) {
    const k = decls.findIndex(x => x.prop.toLowerCase() === prop);
    if (value == null || value === '') { if (k >= 0) decls.splice(k, 1); }
    else if (k >= 0) decls[k] = { prop: decls[k].prop, value };
    else decls.push({ prop, value });
  }
  const text = decls.map(x => x.prop ? `${x.prop}:${x.value}` : x.value).join(';');
  return setAttr(d, n, 'style', text || null);
}

/** замена текстового узла: пробелы по краям исходника сохраняются, неизмененный текст не трогаем */
export function setText(d: Doc, run: TextRun, text: string): Patch {
  const lead = /^\s*/.exec(run.raw)![0], trail = /\s*$/.exec(run.raw)![0];
  const core = run.raw.slice(lead.length, run.raw.length - trail.length);
  if (decode(core) === text) return { src: d.src, at: run.start };
  return { src: splice(d.src, run.start + lead.length, run.end - trail.length, encodeText(text)), at: run.start };
}

const lineIndent = (s: string, at: number) => { const ls = s.lastIndexOf('\n', at - 1) + 1; return /^[ \t]*/.exec(s.slice(ls, at))![0]; };

/** вставка HTML: внутрь в конец (append) или после элемента (after) */
export function insertHTML(d: Doc, n: SrcNode, html: string, where: 'append' | 'after'): Patch {
  if (where === 'after') {
    const ind = lineIndent(d.src, n.start);
    const ins = '\n' + ind + html;
    return { src: splice(d.src, n.end, n.end, ins), at: n.end + 1 + ind.length };
  }
  const ind = lineIndent(d.src, n.start) + '  ';
  // перед закрывающим тегом; если он на своей строке - вставляем отдельной строкой перед ним
  let p = n.closeStart;
  const before = d.src.slice(0, p), ls = before.lastIndexOf('\n') + 1;
  if (/^[ \t]*$/.test(before.slice(ls)) && ls > n.openEnd) {
    const ins = ind + html + '\n';
    return { src: splice(d.src, ls, ls, ins), at: ls + ind.length };
  }
  const ins = '\n' + ind + html + '\n' + lineIndent(d.src, n.start);
  return { src: splice(d.src, p, p, ins), at: p + 1 + ind.length };
}

/** удаление элемента; если он один на строке - вместе с отступом и переводом строки */
export function removeNode(d: Doc, n: SrcNode): Patch {
  let a = n.start, b = n.end;
  const ls = d.src.lastIndexOf('\n', a - 1) + 1;
  const le = d.src.indexOf('\n', b);
  if (/^[ \t]*$/.test(d.src.slice(ls, a)) && /^[ \t]*$/.test(d.src.slice(b, le < 0 ? d.src.length : le))) { a = ls; b = le < 0 ? d.src.length : le + 1; }
  return { src: splice(d.src, a, b, ''), at: a };
}
export const replaceNode = (d: Doc, n: SrcNode, html: string): Patch => ({ src: splice(d.src, n.start, n.end, html), at: n.start });

/** путь элемента, который после патча начинается в позиции at */
export function pathAfter(src: string, at: number) {
  const d = parse(src);
  return nodeAt(d, at)?.path ?? null;
}

/** копия для превью: data-studio-id у каждого элемента внутри сцен. Не сохраняется. */
export const STUDIO_ID = 'data-studio-id';
export function annotate(d: Doc): string {
  const marks: [number, string][] = [];
  for (const [p, n] of d.byPath) marks.push([n.start + 1 + n.tag.length, ` ${STUDIO_ID}="${p}"`]);
  marks.sort((a, b) => b[0] - a[0]);
  let s = d.src;
  for (const [at, ins] of marks) s = s.slice(0, at) + ins + s.slice(at);
  return s;
}

// ---------- сцены ----------
export type SceneInfo = {
  index: number; path: string; s: number; e: number; bg: string; pal: string; tr: string;
  wall: string | null; outro: boolean; text: string; classes: string[]; wipe: string;
};
export function wallOf(n: SrcNode) {
  const m = /--wall:\s*url\(\s*['"]?([^'")]+)['"]?\s*\)/.exec(attr(n, 'style') || '');
  return m ? m[1].replace(/^(\.\.\/)+/, '') : null;
}
export function scenes(d: Doc): SceneInfo[] {
  return d.sections.map((n, index) => {
    const cls = classList(n);
    return {
      index, path: n.path!, s: Number(attr(n, 'data-s') ?? 0), e: Number(attr(n, 'data-e') ?? 0),
      bg: cls.includes('black') ? 'black' : cls.includes('white') ? 'white' : '',
      pal: cls.find(c => c.startsWith('pal-'))?.slice(4) || '', tr: attr(n, 'data-tr') || '',
      wall: wallOf(n), outro: cls.includes('outro'), text: plainText(n).slice(0, 140), classes: cls, wipe: attr(n, 'data-wipe') || '',
    };
  });
}
export function setWall(d: Doc, n: SrcNode, path: string | null): string {
  const decls = styleDecls(attr(n, 'style') || '').filter(x => x.prop !== '--wall');
  if (path) decls.unshift({ prop: '--wall', value: `url(../../${path})` });
  let src = setAttr(d, n, 'style', decls.map(x => x.prop ? `${x.prop}:${x.value}` : x.value).join(';') || null).src;
  const d2 = parse(src), n2 = nodeAt(d2, n.start)!;
  src = toggleClass(d2, n2, 'wall', !!path).src;
  return src;
}
