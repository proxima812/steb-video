// Перенос путей при одинаковых соседях (близнецах): неоднозначность сбрасывает состояние, а не переносит его на близнеца.
import { expect, test } from 'bun:test';
import { remapPaths } from './remap';
import { parse } from './source';

const map = (a: string, b: string, paths: string[]) => Object.fromEntries(remapPaths(parse(a), parse(b), paths));
const SEC = (body: string) => `<html><body>\n<section class="s" data-s="0" data-e="5">\n${body}\n</section>\n</body></html>`;

test('удаление одного из близнецов: два прежних объекта не получают один новый', () => {
  expect(map('<section><p>A</p><p>A</p><p>B</p></section>', '<section><p>A</p><p>B</p></section>', ['s0', 's0.0', 's0.1', 's0.2']))
    .toEqual({ s0: 's0', 's0.0': null, 's0.1': null, 's0.2': 's0.1' });
});

test('удаление первого и второго близнеца с отступами: оба сбрасываются, уникальные идут за собой', () => {
  const from = SEC('  <h1>T</h1>\n  <p>A</p>\n  <p>A</p>\n  <p>B</p>');
  const without = SEC('  <h1>T</h1>\n  <p>A</p>\n  <p>B</p>'); // удален первый или второй - текст один и тот же
  expect(map(from, without, ['s0', 's0.0', 's0.1', 's0.2', 's0.3'])).toEqual({ s0: 's0', 's0.0': 's0.0', 's0.1': null, 's0.2': null, 's0.3': 's0.2' });
});

test('вставка одинакового соседа: прежний объект не угадывается, уникальные сохраняют привязку', () => {
  const from = SEC('  <h1>T</h1>\n  <p>A</p>\n  <p>B</p>');
  const to = SEC('  <h1>T</h1>\n  <p>A</p>\n  <p>A</p>\n  <p>B</p>');
  expect(map(from, to, ['s0.0', 's0.1', 's0.2'])).toEqual({ 's0.0': 's0.0', 's0.1': null, 's0.2': 's0.3' });
});

test('правка одного близнеца однозначна: путь сохраняется, второй близнец не затронут', () => {
  const from = SEC('  <p>A</p>\n  <p>A</p>');
  const to = SEC('  <p>A</p>\n  <p id="x">A</p>');
  expect(map(from, to, ['s0.0', 's0.1'])).toEqual({ 's0.0': 's0.0', 's0.1': 's0.1' });
  const to2 = SEC('  <p>A2</p>\n  <p>A</p>');
  expect(map(from, to2, ['s0.0', 's0.1'])).toEqual({ 's0.0': 's0.0', 's0.1': 's0.1' });
});

test('уникальные объекты: сдвиг при удалении соседа, вложенные близнецы внутри уникальной карточки', () => {
  const from = SEC('  <div class="a">A</div>\n  <div class="card"><i>x</i><i>x</i></div>');
  const to = SEC('  <div class="card"><i>x</i><i>x</i></div>');
  expect(map(from, to, ['s0.0', 's0.1', 's0.1.0', 's0.1.1'])).toEqual({ 's0.0': null, 's0.1': 's0.0', 's0.1.0': 's0.0.0', 's0.1.1': 's0.0.1' });
});

test('тот же текст: пути не меняются, несуществующий путь - null', () => {
  const a = SEC('  <p>A</p>');
  expect(map(a, a, ['s0.0', 's0.9'])).toEqual({ 's0.0': 's0.0', 's0.9': null });
});
