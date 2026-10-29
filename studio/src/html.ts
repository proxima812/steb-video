// Правка атрибутов открывающего тега <section> строкой: остальной HTML сцены не переформатируется.
const TAG = /^<section\b[^>]*>/;
const esc = (v: string) => v.replace(/"/g, '&quot;');
const attrRe = (name: string) => new RegExp(`(\\s${name.replace(/[-]/g, '\\-')})(?=[\\s=>])(\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+)))?`);

export function getAttr(html: string, name: string): string | null {
  const tag = TAG.exec(html)?.[0]; if (!tag) return null;
  const m = attrRe(name).exec(tag);
  return m ? (m[4] ?? m[5] ?? m[6] ?? '') : null;
}

export function setAttr(html: string, name: string, value: string | null): string {
  const tag = TAG.exec(html)?.[0]; if (!tag) return html;
  const re = attrRe(name);
  let next: string;
  if (value == null || value === '') next = tag.replace(re, '');
  else if (re.test(tag)) next = tag.replace(re, `$1="${esc(value)}"`);
  else next = tag.replace(/\s*>$/, ` ${name}="${esc(value)}">`);
  return next + html.slice(tag.length);
}

export const classes = (html: string) => (getAttr(html, 'class') || '').split(/\s+/).filter(Boolean);
export const setClasses = (html: string, fn: (c: string[]) => string[]) => setAttr(html, 'class', fn(classes(html)).join(' '));

export function getWall(html: string) {
  return /--wall:\s*url\(\s*['"]?(?:\.\.\/)*([^'")]+)['"]?\s*\)/.exec(getAttr(html, 'style') || '')?.[1] ?? null;
}

// обои: класс wall + --wall в style; null - убрать
export function setWall(html: string, path: string | null) {
  let style = (getAttr(html, 'style') || '').replace(/\s*--wall:\s*url\([^)]*\)\s*;?/, '').trim();
  if (path) style = `--wall:url(../../${path})` + (style ? ';' + style : '');
  html = setAttr(html, 'style', style || null);
  return setClasses(html, c => path ? (c.includes('wall') ? c : [...c, 'wall']) : c.filter(x => x !== 'wall'));
}
