// Каталог компонентов для вставки в черновик. HTML строится только из классов движка (styles/p5-world.css),
// цвета - переменные палитры. Формулы - LaTeX-комментарий для engine/pipeline/tex2svg.mjs, без HTML-имитации.
import { encodeAttr, encodeText } from './source';

export type Field = { key: string; label: string; type: 'text' | 'textarea' | 'number' | 'select' | 'asset'; def: string; options?: { id: string; title: string }[]; asset?: 'images' | 'avatars' };
export type Ctx = { t: number; id: (base: string) => string };
export type CatalogItem = {
  id: string; title: string; icon: string; desc: string; fields: Field[];
  variants: { id: string; title: string }[];
  build: (v: Record<string, string>, variant: string, ctx: Ctx) => string;
  /** файлы движка (относительно engine/), которые вставка подключит в v.html */
  needs?: string[];
  /** что проверить после вставки */
  after?: string;
};

const e = encodeText, a = encodeAttr;
const T = (x: number) => String(Math.round(x * 100) / 100);
/** текст с выделением: слово из поля «акцент» оборачивается в span.acc / .mark */
function accent(text: string, acc: string, cls = 'acc') {
  const s = e(clean(text));
  if (!acc.trim()) return s;
  const k = s.indexOf(e(clean(acc)));
  return k < 0 ? s : `${s.slice(0, k)}<span class="${cls}">${e(clean(acc))}</span>${s.slice(k + e(clean(acc)).length)}`;
}
/** правила текста проекта: без ё и длинных тире */
export const clean = (s: string) => s.replace(/ё/g, 'е').replace(/Ё/g, 'Е').replace(/[—–]/g, '-');
const lines = (s: string) => clean(s).split('\n').map(x => x.trimEnd()).filter(x => x.trim());

export const CATALOG: CatalogItem[] = [
  {
    id: 'heading', title: 'Заголовок', icon: 'title', desc: 'Inter 800, строки выезжают по словам (data-lines). Время слов - из words.json.',
    variants: [{ id: 'h', title: 'Крупный .h' }, { id: 'h2', title: 'Средний .h2' }, { id: 'h3', title: 'Малый .h3' }],
    fields: [{ key: 'text', label: 'Текст', type: 'text', def: 'Главный вопрос' }, { key: 'acc', label: 'Акцент (слово)', type: 'text', def: 'вопрос' },
      { key: 'times', label: 'Времена слов (через запятую, пусто - от текущего)', type: 'text', def: '' }],
    build: (v, variant, c) => `<div class="${variant}" data-lines="${a(v.times.trim() || T(c.t))}">${accent(v.text, v.acc)}</div>`,
  },
  {
    id: 'text', title: 'Текст', icon: 'notes', desc: 'Google Sans 500. Вход сдвигом с прозрачностью.',
    variants: [{ id: 'plain', title: 'Абзац' }, { id: 'icon', title: 'С иконкой' }],
    fields: [{ key: 'text', label: 'Текст', type: 'text', def: 'Короткая подпись' }, { key: 'icon', label: 'Иконка Material Symbols', type: 'text', def: 'memory' }],
    build: (v, variant, c) => variant === 'icon'
      ? `<div class="p" data-in="${T(c.t)}" data-a="rise"><span class="iw"><i class="mi">${e(v.icon || 'memory')}</i> ${e(clean(v.text))}</span></div>`
      : `<div class="p" data-in="${T(c.t)}" data-a="rise">${e(clean(v.text))}</div>`,
  },
  {
    id: 'number', title: 'Число с подписью', icon: 'pin', desc: 'Огромное число .num (200px+) для ударного момента и подпись.',
    variants: [{ id: 'static', title: 'Число' }, { id: 'count', title: 'Счетчик data-cnt' }],
    fields: [{ key: 'value', label: 'Число', type: 'text', def: '140' }, { key: 'caption', label: 'Подпись', type: 'text', def: 'правил в ролике' },
      { key: 'size', label: 'Размер, px', type: 'number', def: '260' }, { key: 'from', label: 'Счетчик: от', type: 'number', def: '0' }],
    build: (v, variant, c) => {
      const id = c.id('num');
      const val = variant === 'count' && /^\d+$/.test(v.value) ? ` data-cnt="${T(c.t)},${T(c.t + 1)},${+v.from || 0},${v.value}" data-raw` : '';
      return `<div id="${id}" data-in="${T(c.t)}" data-a="rise"><div class="num acc" style="font-size:${+v.size || 260}px"${val}>${e(clean(v.value))}</div>`
        + (v.caption.trim() ? `<div class="p" style="color:var(--mut)">${e(clean(v.caption))}</div>` : '') + `</div>`;
    },
  },
  {
    id: 'card', title: 'Карточка / результат', icon: 'crop_square', desc: 'Обычная карточка или стеклянный смысловой акцент (.glass). Радиус --r (24px).',
    variants: [{ id: 'card', title: 'Карточка' }, { id: 'result', title: 'Результат (glass + иконка)' }],
    fields: [{ key: 'title', label: 'Заголовок', type: 'text', def: 'Тест пройден' }, { key: 'text', label: 'Текст', type: 'text', def: 'все проверки зеленые' },
      { key: 'icon', label: 'Иконка (результат)', type: 'text', def: 'check_circle' }],
    build: (v, variant, c) => {
      const id = c.id(variant === 'result' ? 'result' : 'card'), glass = variant === 'result' ? ' glass' : '';
      const head = variant === 'result' ? `<span class="iw"><i class="mi">${e(v.icon || 'check_circle')}</i> <span class="acc">${e(clean(v.title))}</span></span>` : e(clean(v.title));
      return `<div class="card${glass}" id="${id}" style="padding:40px 50px;align-self:flex-start;max-width:800px" data-in="${T(c.t)}" data-a="rise"><div class="h3">${head}</div>`
        + (v.text.trim() ? `<div class="p" style="color:var(--mut)">${e(clean(v.text))}</div>` : '') + `</div>`;
    },
  },
  {
    id: 'compare', title: 'Сравнение', icon: 'compare', desc: 'Две карточки рядом, правая - акцент. Вторая появляется позже.',
    variants: [{ id: 'cols', title: 'Две колонки' }, { id: 'rows', title: 'Две строки' }],
    fields: [{ key: 'l', label: 'Слева: подпись', type: 'text', def: 'Было' }, { key: 'lv', label: 'Слева: значение', type: 'text', def: '12 с' },
      { key: 'r', label: 'Справа: подпись', type: 'text', def: 'Стало' }, { key: 'rv', label: 'Справа: значение', type: 'text', def: '0.4 с' }],
    build: (v, variant, c) => {
      const id = c.id('cmp'), grid = variant === 'rows' ? 'grid-template-rows:auto auto' : 'grid-template-columns:1fr 1fr';
      const col = (lab: string, val: string, t: number, acc: boolean) =>
        `<div class="card${acc ? ' glass' : ''}" style="padding:36px 40px" data-in="${T(t)}" data-a="rise"><div class="p" style="color:var(--mut)">${e(clean(lab))}</div><div class="num${acc ? ' acc' : ''}" style="font-size:150px">${e(clean(val))}</div></div>`;
      return `<div id="${id}" style="display:grid;${grid};gap:24px;width:100%">${col(v.l, v.lv, c.t, false)}${col(v.r, v.rv, c.t + .6, true)}</div>`;
    },
  },
  {
    id: 'code', title: 'Код', icon: 'code', desc: 'Блок .code5 (Google Sans). Печать data-type - посимвольно от времени.',
    variants: [{ id: 'block', title: 'Блок' }, { id: 'type', title: 'Печать (одна строка)' }],
    fields: [{ key: 'code', label: 'Код', type: 'textarea', def: 'x.shape == (2, 3)' }, { key: 'cps', label: 'Печать: символов в секунду', type: 'number', def: '24' }],
    build: (v, variant, c) => {
      const id = c.id('code');
      if (variant === 'type') { const s = clean(v.code).split('\n')[0]; return `<div class="code5 mono" id="${id}" style="padding:36px 40px;font-size:40px" data-in="${T(c.t)}" data-a="rise"><span data-type="${a(s)}" data-t0="${T(c.t + .3)}" data-cps="${+v.cps || 24}"></span></div>`; }
      return `<div class="code5 mono" id="${id}" style="padding:36px 40px;font-size:40px;white-space:pre" data-in="${T(c.t)}" data-a="rise">${lines(v.code).map(e).join('\n')}</div>`;
    },
  },
  {
    id: 'table', title: 'Таблица', icon: 'table', desc: 'Строки через перенос, колонки через «|». Первая строка - шапка.',
    variants: [{ id: 'plain', title: 'Обычная' }, { id: 'card', title: 'В карточке' }],
    fields: [{ key: 'rows', label: 'Строки', type: 'textarea', def: 'модель | время\nстарая | 12 с\nновая | 0.4 с' }],
    build: (v, variant, c) => {
      const id = c.id('tbl'), rows = lines(v.rows).map(r => r.split('|').map(x => x.trim()));
      const td = (x: string, h: boolean) => `<${h ? 'th' : 'td'} style="text-align:left;padding:18px 20px;border-bottom:2px solid var(--ring)${h ? ';color:var(--mut);font-weight:500' : ''}">${e(x)}</${h ? 'th' : 'td'}>`;
      const table = `<table class="tbl" style="width:100%;border-collapse:collapse;font-size:42px">${rows.map((r, i) => `<tr>${r.map(x => td(x, !i)).join('')}</tr>`).join('')}</table>`;
      return variant === 'card' ? `<div class="card" id="${id}" style="padding:24px 30px" data-in="${T(c.t)}" data-a="rise">${table}</div>`
        : `<div id="${id}" data-safe data-in="${T(c.t)}" data-a="rise">${table}</div>`;
    },
  },
  {
    id: 'flow', title: 'Схема', icon: 'schema', desc: 'Цепочка шагов: чипы и стрелки, шаги появляются по очереди.',
    variants: [{ id: 'row', title: 'В строку' }, { id: 'col', title: 'Столбиком' }],
    fields: [{ key: 'steps', label: 'Шаги (через перенос)', type: 'textarea', def: 'запрос\nмодель\nответ' }, { key: 'step', label: 'Шаг появления, с', type: 'number', def: '0.4' }],
    build: (v, variant, c) => {
      const id = c.id('flow'), st = +v.step || .4, col = variant === 'col';
      const items = lines(v.steps).map((s, i) => (i ? `<i class="mi" style="font-size:56px;color:var(--mut)" data-in="${T(c.t + i * st - .1)}" data-a="rise">${col ? 'arrow_downward' : 'arrow_forward'}</i>` : '')
        + `<div class="chip${i === lines(v.steps).length - 1 ? ' on' : ''}" style="padding:18px 34px;font-size:44px" data-in="${T(c.t + i * st)}" data-a="rise">${e(s)}</div>`).join('');
      return `<div id="${id}" data-safe style="display:flex;flex-direction:${col ? 'column' : 'row'};flex-wrap:wrap;align-items:center;gap:18px">${items}</div>`;
    },
  },
  {
    id: 'image', title: 'Картинка', icon: 'image', desc: 'Мем или иллюстрация .pic (200-250px). Для перехода meme нужен id.',
    variants: [{ id: 'flow', title: 'В потоке' }, { id: 'corner', title: 'Справа сверху' }],
    fields: [{ key: 'src', label: 'Файл', type: 'asset', asset: 'images', def: '' }, { key: 'size', label: 'Размер, px', type: 'number', def: '240' }],
    build: (v, variant, c) => {
      const id = c.id('pic'), s = +v.size || 240, src = '../' + v.src.split('/').map(encodeURIComponent).join('/');
      const pos = variant === 'corner' ? `;position:absolute;right:65px;top:300px` : ';align-self:flex-start';
      return `<img class="pic" id="${id}" src="${a(src)}" alt="" style="width:${s}px;height:${s}px;object-fit:cover${pos}" data-in="${T(c.t)}" data-a="rise">`;
    },
    after: 'Проверьте, что картинка не закрывает текст.',
  },
  {
    id: 'avatar', title: 'Аватар', icon: 'person', desc: 'Вырезанное фото ведущего, вход data-a="rise". 2-3 сцены за ролик, низ кадра должен быть свободен.',
    variants: [{ id: 'bl', title: 'Снизу слева' }, { id: 'br ring', title: 'Справа снизу, обводка' }, { id: 'mid', title: 'По центру' }, { id: 'low ring', title: 'По центру снизу, обводка' }],
    fields: [{ key: 'file', label: 'Фото', type: 'select', def: 'bl', options: [{ id: 'bl', title: 'очки (bl)' }, { id: 'br', title: 'улыбка (br)' }, { id: 'ring', title: 'серьезный (ring)' }, { id: 'mid', title: 'костюм (mid)' }] },
      { key: 'h', label: 'Высота --ava-h, px (480-720)', type: 'number', def: '600' }],
    build: (v, variant, c) => `<img class="ava ${variant}" src="../video/avatar/cut/${a(v.file || 'bl')}.png" alt="" style="--ava-h:${Math.min(720, Math.max(480, +v.h || 600))}px" data-in="${T(c.t)}" data-a="rise">`,
    after: 'Аватар не должен перекрывать текст: сдвиньте контент вбок.',
  },
  {
    id: 'formula', title: 'Формула (LaTeX)', icon: 'function', desc: 'LaTeX -> SVG через engine/pipeline/tex2svg.mjs. До рендера в черновике пусто.',
    variants: [{ id: 'block', title: 'Блок' }],
    fields: [{ key: 'tex', label: 'LaTeX', type: 'textarea', def: 'y = Wx + b' }, { key: 'size', label: 'Размер шрифта, px', type: 'number', def: '96' }],
    build: (v, _variant, c) => `<div class="tex" id="${c.id('f')}" style="font-size:${+v.size || 96}px" data-in="${T(c.t)}" data-a="rise"><!--tex ${v.tex.replace(/-->/g, '- ->')}--><!--/tex--></div>`,
    after: 'Нажмите «Сверстать формулы»: SVG делает tex2svg.mjs.',
  },
];

export const defaults = (it: CatalogItem) => Object.fromEntries(it.fields.map(f => [f.key, f.def]));

/** пользовательский пресет ролика: сохраненный HTML объекта */
export type UserPreset = { name: string; html: string; kind: string; created: string };
