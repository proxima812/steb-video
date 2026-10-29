// Каталог возможностей: тип объекта исходника и применимые к нему свойства панели.
import { attr, classList, type SrcNode } from './source';

export type Kind = 'section' | 'heading' | 'text' | 'number' | 'card' | 'code' | 'image' | 'avatar' | 'formula' | 'table' | 'diagram' | 'canvas3d' | 'icon' | 'chip' | 'inline' | 'other';
export type Prop = 'text' | 'size' | 'spacing' | 'align' | 'font' | 'palette' | 'glass' | 'mark' | 'ring' | 'position' | 'avatar' | 'motion' | 'id' | 'src';

export const KIND_LABEL: Record<Kind, string> = {
  section: 'Сцена', heading: 'Заголовок', text: 'Текст', number: 'Число', card: 'Карточка', code: 'Код', image: 'Картинка',
  avatar: 'Аватар', formula: 'Формула', table: 'Таблица', diagram: 'Схема', canvas3d: '3D', icon: 'Иконка', chip: 'Чип', inline: 'Фрагмент', other: 'Элемент',
};
export const KIND_ICON: Record<Kind, string> = {
  section: 'crop_portrait', heading: 'title', text: 'notes', number: 'pin', card: 'crop_square', code: 'code', image: 'image',
  avatar: 'person', formula: 'function', table: 'table', diagram: 'schema', canvas3d: 'deployed_code', icon: 'emoji_symbols', chip: 'label', inline: 'format_color_text', other: 'data_object',
};

const INLINE = new Set(['span', 'b', 'i', 'em', 'strong', 'small', 'sup', 'sub', 'a', 'br']);
export function kindOf(n: SrcNode): Kind {
  const c = classList(n), has = (x: string) => c.includes(x);
  if (n.tag === 'section') return 'section';
  if (n.tag === 'img') return has('ava') ? 'avatar' : 'image';
  if (has('tex')) return 'formula';
  if (n.tag === 'canvas' || attr(n, 'data-three') != null) return 'canvas3d';
  if (n.tag === 'table' || has('tbl')) return 'table';
  if (n.tag === 'svg' || has('plot') || has('diagram')) return 'diagram';
  if (has('code5') || has('code') || n.tag === 'pre') return 'code';
  if (has('num')) return 'number';
  if (has('h') || has('h2') || has('h3') || /^h[1-6]$/.test(n.tag)) return 'heading';
  if (has('mi') && n.tag === 'i') return 'icon';
  if (has('chip') || has('stampx')) return 'chip';
  if (has('card') || has('box') || has('glass') || has('panel')) return 'card';
  if (has('p') || n.tag === 'p') return 'text';
  if (INLINE.has(n.tag)) return 'inline';
  return 'other';
}

const BASE: Prop[] = ['id', 'motion'];
export const PROPS: Record<Kind, Prop[]> = {
  section: [],
  heading: ['text', 'font', 'align', 'size', 'spacing', 'palette', 'mark', 'position', ...BASE],
  text: ['text', 'font', 'align', 'size', 'spacing', 'palette', 'mark', 'position', ...BASE],
  number: ['text', 'font', 'align', 'size', 'spacing', 'palette', 'position', ...BASE],
  inline: ['text', 'font', 'palette', 'mark', ...BASE],
  chip: ['text', 'font', 'palette', 'glass', 'spacing', ...BASE],
  card: ['text', 'size', 'spacing', 'align', 'palette', 'glass', 'position', ...BASE],
  code: ['text', 'size', 'spacing', 'font', 'glass', 'position', ...BASE],
  table: ['text', 'size', 'spacing', 'font', 'position', ...BASE],
  image: ['src', 'size', 'align', 'position', ...BASE],
  avatar: ['src', 'avatar', 'ring', ...BASE],
  formula: ['size', 'align', 'palette', 'position', ...BASE],
  diagram: ['size', 'align', 'palette', 'position', ...BASE],
  canvas3d: ['size', 'align', 'position', ...BASE],
  icon: ['text', 'font', 'palette', ...BASE],
  other: ['text', 'size', 'spacing', 'align', 'font', 'palette', 'glass', 'position', ...BASE],
};
export const can = (n: SrcNode, p: Prop) => PROPS[kindOf(n)].includes(p);

/** Входы, допустимые в мире p5w (без scale, вращений и отскока) */
export const ENTER_ANIMS = [
  { id: 'rise', title: 'снизу' }, { id: 'drop', title: 'сверху' }, { id: 'left', title: 'слева' }, { id: 'right', title: 'справа' },
  { id: 'stamp', title: 'шторка (штамп)' }, { id: 'up', title: 'снизу (движок)' },
];
export const EASES = [{ id: '', title: 'по умолчанию (glide)' }, { id: 'glide', title: 'glide' }, { id: 'cine', title: 'cine' }, { id: 'soft', title: 'soft' }];
export const AVATAR_POS = [{ id: 'bl', title: 'снизу слева' }, { id: 'br', title: 'справа снизу' }, { id: 'mid', title: 'по центру (y 1670)' }, { id: 'low', title: 'по центру снизу' }];
export const AVATAR_FILES = ['bl', 'br', 'ring', 'mid'];
