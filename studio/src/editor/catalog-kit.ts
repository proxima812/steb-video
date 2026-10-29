// Набор компонентов пресета default (engine/styles/p5-world.css, пример engine/examples/components.html):
// окно, список, таблица, уведомление, кнопки, тумблеры, показатель, сегменты, клавиши. Один стиль: ring 2px или плитка,
// радиусы --r / --r-in / --r-s, капсулы. Вариант «стекло» - для сцены на обоях (.black.wall). Подключать ничего не нужно.
import type { CatalogItem } from './catalog';
import { clean } from './catalog';
import { encodeAttr as a, encodeText as e } from './source';

const T = (x: number) => String(Math.round(x * 100) / 100);
const lines = (s: string) => clean(s).split('\n').map(x => x.trim()).filter(Boolean);
const cols = (s: string) => s.split('|').map(x => x.trim());
const GLASS = { id: 'glass', title: 'Стекло (на обоях)' };
const g = (variant: string) => variant === 'glass' ? ' glass' : '';

export const KIT_CATALOG: CatalogItem[] = [
  {
    id: 'kit-window', title: 'Окно приложения', icon: 'web_asset',
    desc: 'Окно .win: полоса с точками и адресом, поле поиска (печать data-type) и сегменты фильтра. Хорошая цель для наезда камеры.',
    variants: [{ id: 'plain', title: 'Обычное' }, GLASS],
    fields: [{ key: 'title', label: 'Адрес / заголовок', type: 'text', def: 'shop.local / поиск' },
      { key: 'query', label: 'Запрос в поле', type: 'text', def: 'диван' },
      { key: 'seg', label: 'Сегменты через «|» (первый выбран, пусто - без них)', type: 'text', def: 'Все | Мебель | Софы' }],
    build: (v, variant, c) => {
      const q = clean(v.query), segs = cols(clean(v.seg)).filter(Boolean);
      const seg = segs.length ? `<div class="seg">${segs.map((s, i) => `<span${i ? '' : ' class="on"'}>${e(s)}</span>`).join('')}</div>` : '';
      return `<div class="win${g(variant)}" id="${c.id('win')}" style="width:100%" data-in="${T(c.t)}" data-a="rise">`
        + `<div class="win-bar"><i></i><i></i><i></i><b>${e(clean(v.title))}</b></div><div class="win-body">`
        + `<div class="field on"><i class="mi">search</i><span data-type="${a(q)}" data-t0="${T(c.t + .5)}" data-cps="12"></span></div>${seg}</div></div>`;
    },
    after: 'Время печати data-t0 - на слово запроса из words.json.',
  },
  {
    id: 'kit-list', title: 'Список с иконками', icon: 'list',
    desc: 'Строки .li: иконка в плитке, текст, значение справа. Строки «иконка | текст | справа», появляются по очереди. Последняя - акцент (.on).',
    variants: [{ id: 'card', title: 'В карточке' }, { id: 'plain', title: 'Без карточки' }, GLASS],
    fields: [{ key: 'rows', label: 'Строки', type: 'textarea', def: 'database | Индекс | 12 мс\nmemory | Кеш | 2 мс\nbolt | Ответ | 1 мс' },
      { key: 'step', label: 'Шаг между строками, с', type: 'number', def: '0.4' }],
    build: (v, variant, c) => {
      const rs = lines(v.rows).map(cols), st = +v.step || .4;
      const li = rs.map((r, i) => { const last = i === rs.length - 1;
        return `<div class="li${last ? ' on' : ''}" data-in="${T(c.t + i * st)}" data-a="rise"><span class="ib${last ? ' solid' : ''}"><i class="mi">${e(r[0] || 'check')}</i></span>${e(r[1] || '')}`
          + (r[2] ? `<span class="li-m">${e(r[2])}</span>` : '') + `</div>`; }).join('');
      const list = `<div class="list">${li}</div>`;
      return variant === 'plain' ? `<div id="${c.id('list')}" style="width:100%">${list}</div>`
        : `<div class="card${g(variant)}" id="${c.id('list')}" style="width:100%;padding:12px 36px">${list}</div>`;
    },
  },
  {
    id: 'kit-table', title: 'Таблица (строки)', icon: 'table_rows',
    desc: 'Таблица .tbl из строк .tr: первая строка - шапка, колонки через «|», последняя колонка - число справа. Выделенная строка - подложка палитры.',
    variants: [{ id: 'plain', title: 'Без карточки' }, { id: 'card', title: 'В карточке' }, GLASS],
    fields: [{ key: 'rows', label: 'Строки', type: 'textarea', def: 'запрос | находит | мс\nдиван | диван | 14\nдиван | софа | 9' },
      { key: 'on', label: 'Выделить строку № (с 1, без шапки; 0 - нет)', type: 'number', def: '2' },
      { key: 'step', label: 'Шаг между строками, с', type: 'number', def: '0.3' }],
    build: (v, variant, c) => {
      const rs = lines(v.rows).map(cols), n = Math.max(...rs.map(r => r.length)), on = +v.on || 0, st = +v.step || .3;
      const tpl = Array.from({ length: n }, (_, i) => i === n - 1 ? '160px' : '1fr').join(' ');
      const tr = rs.map((r, i) => `<div class="tr${i ? '' : ' th'}${i && i === on ? ' on' : ''}" data-in="${T(c.t + i * st)}" data-a="rise">`
        + r.map((x, j) => `<span${j === n - 1 ? ' class="r"' : ''}>${e(x)}</span>`).join('') + `</div>`).join('');
      const tbl = `<div class="tbl" style="--cols:${tpl}">${tr}</div>`;
      return variant === 'plain' ? `<div id="${c.id('tbl')}" style="width:100%">${tbl}</div>`
        : `<div class="card${g(variant)}" id="${c.id('tbl')}" style="width:100%;padding:16px 20px">${tbl}</div>`;
    },
  },
  {
    id: 'kit-toast', title: 'Уведомление', icon: 'notifications',
    desc: 'Карточка-событие .toast: иконка, заголовок, текст и тег времени. Входит из размытия (data-a="blur").',
    variants: [{ id: 'plain', title: 'Обычное' }, GLASS],
    fields: [{ key: 'icon', label: 'Иконка', type: 'text', def: 'notifications' }, { key: 'title', label: 'Заголовок', type: 'text', def: 'Сборка готова' },
      { key: 'text', label: 'Текст', type: 'text', def: '3 файла, 1.2 МБ' }, { key: 'tag', label: 'Тег справа', type: 'text', def: 'сейчас' }],
    build: (v, variant, c) => `<div class="toast${g(variant)}" id="${c.id('toast')}" style="width:100%" data-in="${T(c.t)}" data-a="blur">`
      + `<span class="ib solid"><i class="mi">${e(v.icon || 'notifications')}</i></span><div><b>${e(clean(v.title))}</b><span>${e(clean(v.text))}</span></div>`
      + (v.tag.trim() ? `<span class="tag">${e(clean(v.tag))}</span>` : '') + `</div>`,
  },
  {
    id: 'kit-buttons', title: 'Кнопки', icon: 'smart_button',
    desc: 'Главная кнопка .btn (капсула, цвет палитры) и вторая .btn.ghost. В стекле главная подкрашена акцентом.',
    variants: [{ id: 'plain', title: 'Обычные' }, GLASS],
    fields: [{ key: 'main', label: 'Главная', type: 'text', def: 'Запустить' }, { key: 'icon', label: 'Иконка главной (пусто - нет)', type: 'text', def: 'play_arrow' },
      { key: 'second', label: 'Вторая (пусто - нет)', type: 'text', def: 'Отмена' }],
    build: (v, variant, c) => `<div id="${c.id('btns')}" style="display:flex;gap:20px;align-items:center" data-in="${T(c.t)}" data-a="rise">`
      + `<span class="btn${g(variant)}" id="${c.id('btn')}">${v.icon.trim() ? `<i class="mi">${e(v.icon.trim())}</i>` : ''}${e(clean(v.main))}</span>`
      + (v.second.trim() ? `<span class="btn ghost">${e(clean(v.second))}</span>` : '') + `</div>`,
    after: 'Нажатие - курсор data-cur у сцены: "t #btn click".',
  },
  {
    id: 'kit-switches', title: 'Тумблеры / флажки', icon: 'toggle_on',
    desc: 'Список настроек: подпись и тумблер .tog (или флажок .chk), включаются по очереди data-mk за .55 с.',
    variants: [{ id: 'tog', title: 'Тумблеры' }, { id: 'chk', title: 'Флажки' }, { id: 'glass', title: 'Тумблеры в стекле' }],
    fields: [{ key: 'rows', label: 'Подписи (строки)', type: 'textarea', def: 'Кеш\nИндекс\nСинонимы' },
      { key: 'step', label: 'Шаг включения, с', type: 'number', def: '0.5' }],
    build: (v, variant, c) => {
      const st = +v.step || .5, cls = variant === 'chk' ? 'chk' : 'tog';
      const li = lines(v.rows).map((x, i) => `<div class="li">${e(x)}<span class="li-m" style="display:flex"><i class="${cls}" data-mk="${T(c.t + .6 + i * st)}"></i></span></div>`).join('');
      return `<div class="card${g(variant)}" id="${c.id('set')}" style="width:100%;padding:12px 36px" data-in="${T(c.t)}" data-a="rise"><div class="list">${li}</div></div>`;
    },
  },
  {
    id: 'kit-kpi', title: 'Показатель', icon: 'monitoring',
    desc: 'Число .num с подписью .kpi-l. Карточка, плитка палитры или стекло.',
    variants: [{ id: 'card', title: 'Карточка' }, { id: 'tile', title: 'Плитка палитры' }, GLASS],
    fields: [{ key: 'num', label: 'Число', type: 'text', def: '98%' }, { key: 'label', label: 'Подпись', type: 'text', def: 'запросов без ответа' }],
    build: (v, variant, c) => `<div class="${variant === 'tile' ? 'tile on' : 'card'}${g(variant)} kpi" id="${c.id('kpi')}" style="padding:34px 40px;align-self:flex-start" data-in="${T(c.t)}" data-a="rise">`
      + `<div class="num${variant === 'tile' ? '' : ' acc'}">${e(clean(v.num))}</div><div class="kpi-l">${e(clean(v.label))}</div></div>`,
  },
  {
    id: 'kit-seg', title: 'Переключатель', icon: 'view_week',
    desc: 'Сегменты .seg: выбранный вариант на подложке акцента.',
    variants: [{ id: 'plain', title: 'Обычный' }, GLASS],
    fields: [{ key: 'opts', label: 'Варианты через «|»', type: 'text', def: 'День | Неделя | Месяц' },
      { key: 'on', label: 'Выбран № (с 1)', type: 'number', def: '1' }],
    build: (v, variant, c) => `<div class="seg${g(variant)}" id="${c.id('seg')}" style="align-self:flex-start" data-in="${T(c.t)}" data-a="rise">`
      + cols(clean(v.opts)).filter(Boolean).map((x, i) => `<span${i + 1 === (+v.on || 1) ? ' class="on"' : ''}>${e(x)}</span>`).join('') + `</div>`,
  },
  {
    id: 'kit-keys', title: 'Сочетание клавиш', icon: 'keyboard',
    desc: 'Клавиши .kbd внутри текста: «Ctrl + K». Клавиши через «+».',
    variants: [{ id: 'plain', title: 'Строка' }],
    fields: [{ key: 'before', label: 'Текст перед', type: 'text', def: 'нажми' }, { key: 'keys', label: 'Клавиши через «+»', type: 'text', def: 'Ctrl + K' }],
    build: (v, _variant, c) => `<div class="h3" id="${c.id('keys')}" data-in="${T(c.t)}" data-a="rise">${e(clean(v.before))} `
      + v.keys.split('+').map(k => `<span class="kbd">${e(clean(k.trim()))}</span>`).join(' + ') + `</div>`,
  },
];
