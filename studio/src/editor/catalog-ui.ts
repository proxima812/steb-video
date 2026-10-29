// UI-компоненты из внешних примеров (кнопки, поля, виджеты), адаптированные под мир p5w.
// Стили - engine/styles/p5-ui.css (.ui-<имя>), анимация от времени кадра - engine/components/p5-ui.js.
// Новый компонент: блок в p5-ui.css, при необходимости атрибут в p5-ui.js, запись здесь с needs.
import type { CatalogItem } from './catalog';
import { clean } from './catalog';
import { encodeText as e } from './source';

const T = (x: number) => String(Math.round(x * 100) / 100);
const ARROW = '<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M779.18 473.23 322.35 16.41c-21.41-21.41-56.12-21.41-77.53 0-21.41 21.41-21.41 56.12 0 77.53l418.06 418.06-418.06 418.06c-21.41 21.41-21.41 56.12 0 77.53 10.71 10.71 24.76 16.06 38.77 16.06s28.06-5.35 38.77-16.06l456.83-456.83c21.41-21.41 21.41-56.12 0-77.54z"/></svg>';
/** файлы движка, которые вставка подключит в v.html один раз */
export const UI_NEEDS = { css: 'styles/p5-ui.css', js: 'components/p5-ui.js' };

export const UI_CATALOG: CatalogItem[] = [
  {
    id: 'ui-start', title: 'Кнопка «Начать»', icon: 'smart_button', needs: [UI_NEEDS.css, UI_NEEDS.js],
    desc: 'Стеклянная капсула с текстом и кругом со стрелкой. Нажатие data-press: подъем, нажатие, стрелка сдвигается. Размеры - --w/--h/--fs/--ic в style.',
    variants: [{ id: 'press', title: 'С нажатием' }, { id: 'static', title: 'Без нажатия' }],
    fields: [{ key: 'text', label: 'Текст', type: 'text', def: 'Начать' },
      { key: 'w', label: 'Ширина, px (до 950)', type: 'number', def: '620' }, { key: 'h', label: 'Высота, px', type: 'number', def: '180' },
      { key: 'fs', label: 'Размер текста, px', type: 'number', def: '60' },
      { key: 'press', label: 'Нажатие через, с (от входа; можно несколько через запятую)', type: 'text', def: '0.8' }],
    build: (v, variant, c) => {
      const w = Math.min(950, Math.max(240, +v.w || 620)), h = Math.max(80, +v.h || 180), fs = Math.max(24, +v.fs || 60);
      const presses = v.press.split(',').map(x => +x).filter(x => Number.isFinite(x) && x >= 0).map(x => T(c.t + x));
      const press = variant === 'press' && presses.length ? ` data-press="${presses.join(',')}"` : '';
      return `<div class="ui-start glass" id="${c.id('btn')}" style="--w:${w}px;--h:${h}px;--fs:${fs}px;--ic:${Math.round(h * .62)}px;align-self:flex-start"`
        + ` data-in="${T(c.t)}" data-a="rise"${press}><span class="ui-text">${e(clean(v.text))}</span><span class="ui-ic">${ARROW}</span><span class="ui-ring"></span></div>`;
    },
    after: 'Камера: наезд на кнопку к моменту нажатия (цель не шире 800px).',
  },
];

/** подключить нужные файлы движка в исходник ролика; возвращает новый текст и сдвиг позиции at */
export function withNeeds(src: string, at: number, needs: string[] = []) {
  for (const n of needs) {
    if (src.includes(`"${n}"`)) continue;
    const css = n.endsWith('.css');
    const tag = css ? `<link rel="stylesheet" href="${n}">` : `<script src="${n}"></script>`;
    const anchor = css ? src.indexOf('<link rel="stylesheet" href="styles/p5-world.css">') : src.indexOf('<script src="runtime/engine.js">');
    let p: number;
    if (anchor >= 0) p = css ? anchor + '<link rel="stylesheet" href="styles/p5-world.css">'.length : anchor;
    else p = css ? src.indexOf('</head>') : src.lastIndexOf('</body>');
    if (p < 0) continue;
    const ins = css ? tag : tag + '\n';
    src = src.slice(0, p) + ins + src.slice(p);
    if (p <= at) at += ins.length;
  }
  return { src, at };
}
