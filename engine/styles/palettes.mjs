// Палитры Colorhunt (https://colorhunt.co) для пресета default: случайные паки по теме ролика -> engine/palette-N.css.
// Запуск из корня: node engine/styles/palettes.mjs N "тег1,тег2" [--count 4] [--no-red] [--seed X] [--force]
// Теги Colorhunt: pastel vintage retro neon gold light dark warm cold summer fall winter spring happy nature earth
//   night space rainbow sunset sky sea kids skin food cream coffee wedding christmas + цвета (blue green purple ...).
// Выбор детерминирован (seed = номер ролика) и сохраняется в video/N-*/palette.json: перерендер не меняет цвета.
// Каждая палитра (4 цвета) становится темой сцены: фон - самый темный или самый светлый цвет, текст - контрастный,
// акцент - самый насыщенный цвет, читаемый на фоне. Темы назначаются классам .dark/.light/.candy/.electric
// (имена классов - только слоты для чередования, цвета берутся из палитр). Темные и светлые палитры чередуются.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const n = args[0], tags = (args[1] || '').split(',').map(s => s.trim()).filter(Boolean);
const opt = k => { const i = args.indexOf('--' + k); return i < 0 ? null : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const count = +(opt('count') || 4), noRed = !!opt('no-red'), force = !!opt('force');
if (!n) { console.error('node engine/styles/palettes.mjs N "тег1,тег2" [--count 4] [--no-red] [--seed X] [--force]'); process.exit(1); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dir = fs.readdirSync(path.join(root, 'video')).find(d => d.startsWith(n + '-'));
if (!dir) { console.error('нет папки video/' + n + '-*'); process.exit(1); }
const saved = path.join(root, 'video', dir, 'palette.json');

const hex = c => '#' + c.toUpperCase();
const rgb = h => [0, 2, 4].map(i => parseInt(h.slice(i + 1, i + 3), 16) / 255);
const lum = h => { const [r, g, b] = rgb(h).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * r + .7152 * g + .0722 * b; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
const hsl = h => {
  const [r, g, b] = rgb(h), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l]; const s = d / (1 - Math.abs(2 * l - 1));
  const hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [(hh * 60 + 360) % 360, s, l];
};
const reddish = h => { const [H, S] = hsl(h); return S > .3 && (H < 20 || H > 300); };

// палитра -> тема или null, если не набирается читаемой пары
function theme(colors) {
  const by = [...colors].sort((a, b) => lum(a) - lum(b));
  let best = null;
  for (const dark of [true, false]) {
    const bg = dark ? by[0] : by[3], fg = dark ? by[3] : by[0];
    if (contrast(bg, fg) < 7) continue;
    const rest = colors.filter(c => c !== bg && c !== fg);
    const acc = [...rest].filter(c => contrast(c, bg) >= 2.6).sort((a, b) => hsl(b)[1] - hsl(a)[1])[0];
    if (!acc) continue;
    const other = rest.find(c => c !== acc) || acc;
    const card = contrast(other, bg) < 2 ? other : null;   // близкий к фону - карточки, иначе второй акцент
    const t = { dark, bg, fg, acc, acc2: card ? fg : other, card: card || null, score: contrast(bg, fg) + contrast(acc, bg) };
    if (!best || t.score > best.score) best = t;
  }
  return best;
}

let picked;
if (fs.existsSync(saved) && !force) picked = JSON.parse(fs.readFileSync(saved, 'utf8')).palettes;
else {
  const feed = async (sort, step, tf) => {
    const r = await fetch('https://colorhunt.co/php/feed.php', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest', 'Referer': 'https://colorhunt.co/', 'User-Agent': 'Mozilla/5.0' },
      body: `step=${step}&sort=${sort}&tags=${encodeURIComponent(tags.join('-'))}&timeframe=${tf}`
    });
    return r.json();
  };
  let pool = [];
  for (let step = 0; step < 4; step++) pool.push(...await feed('popular', step, 4000));
  if (pool.length < count * 3) pool.push(...await feed('random', 0, 4000));
  const seen = new Set();
  pool = pool.filter(p => !seen.has(p.code) && seen.add(p.code)).map(p => {
    const colors = p.code.match(/.{6}/g).map(hex);
    return { code: p.code, url: 'https://colorhunt.co/palette/' + p.code, likes: +p.likes, colors, t: theme(colors) };
  }).filter(p => p.t && !(noRed && p.colors.some(reddish)));
  // детерминированное «случайное» перемешивание по seed
  let s = [...String(opt('seed') || n)].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 2147483647 || 7;
  const rnd = () => (s = s * 16807 % 2147483647) / 2147483647;
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1));[pool[i], pool[j]] = [pool[j], pool[i]]; }
  const darks = pool.filter(p => p.t.dark), lights = pool.filter(p => !p.t.dark);
  if (!darks.length || !lights.length) { console.error(`мало палитр по тегам "${tags}": темных ${darks.length}, светлых ${lights.length}. Добавь теги`); process.exit(1); }
  picked = [];
  for (let i = 0; i < count; i++) { const src = i % 2 ? lights : darks; const p = src[Math.floor(i / 2) % src.length]; picked.push({ code: p.code, url: p.url, colors: p.colors }); }
  fs.writeFileSync(saved, JSON.stringify({ source: 'colorhunt.co', tags, palettes: picked }, null, 2) + '\n');
}

const slots = ['dark', 'light', 'electric', 'candy'];
let css = `/* Ролик ${n}: палитры Colorhunt (${picked.map(p => p.url).join(', ')}).\n   Сгенерировано engine/styles/palettes.mjs, выбор в video/${dir}/palette.json. Подключать после preset-dynamic.css.\n   Чередование тем: ${slots.slice(0, picked.length).join(' -> ')}. */\n`;
picked.forEach((p, i) => {
  const t = theme(p.colors), k = slots[i], ink = t.dark ? '255,255,255' : '0,0,0';
  const card = t.card || `color-mix(in srgb,${t.fg} ${t.dark ? 8 : 6}%,${t.bg})`;
  css += `.${k}{background:${t.bg};color:${t.fg};--ring:color-mix(in srgb,${t.fg} 16%,transparent);--mut:color-mix(in srgb,${t.fg} 62%,${t.bg});` +
    `--acc:${t.acc};--acc2:${t.acc2};--tile:${card};--card:${card};--chip:color-mix(in srgb,${t.fg} 8%,transparent);--on:${t.bg};` +
    `--gt:linear-gradient(180deg,${t.fg} 30%,${t.acc});--pbg:${t.bg};--pcard:${t.card || t.bg};--pdark:${t.dark ? 1 : 0}}\n` +
    `.${k} .shim{--sh:${t.acc}}body[data-th=${k}] .handle{color:${t.fg}}\n`;
  console.log(`${k.padEnd(9)} ${t.dark ? 'темная ' : 'светлая'} bg ${t.bg} fg ${t.fg} acc ${t.acc} acc2 ${t.acc2} card ${t.card || '(mix)'}  ${p.url}`);
});
css += `.code5{background:#111;color:#eee}\n`;
fs.writeFileSync(path.join(root, 'engine', `palette-${n}.css`), css);
console.log(`engine/palette-${n}.css`);
