// Планирует ролик в Instagram (страница «Запланированный контент») через окно Яндекс Браузера PostV (порт 9222).
// node post.mjs <N> [--dry] [--at "YYYY-MM-DD HH:MM"] [--force]
//   N       - номер ролика (папка video/N-slug, нужны output/video.mp4, cover.jpg, summary-inst.txt)
//   --dry   - заполнить все и остановиться перед «Запланировать», окно закрыть без публикации
//   --at    - своя дата и время; иначе следующий слот (06:00, 08:00, 12:00) после последнего запланированного поста
//   --force - планировать, даже если есть output/posted.json
// Каждый шаг окна проверяется по DOM и по скриншоту через Jev (jev.mjs). Итог - output/posted.json.
import fs from 'fs';
import path from 'path';
import {createRequire} from 'module';
import {fileURLToPath} from 'url';
import {jev} from './jev.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const require = createRequire(path.join(ROOT, 'engine/package.json'));
const puppeteer = require('puppeteer-core');
const URL_SC = 'https://www.instagram.com/scheduled_content/';
const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const SHOT = '/tmp/postv/step.png';
fs.mkdirSync('/tmp/postv', {recursive: true});

const args = process.argv.slice(2);
const N = args.find(a => /^\d+$/.test(a));
const DRY = args.includes('--dry'), FORCE = args.includes('--force');
const AT = args.includes('--at') ? args[args.indexOf('--at') + 1] : null;
const die = (m, code = 1) => { console.error('СТОП: ' + m); process.exit(code); };
const log = m => console.log('- ' + m);
const sleep = ms => new Promise(r => setTimeout(r, ms));
if (!N) die('укажи номер ролика: node post.mjs 38');

// --- файлы ролика
const dir = fs.readdirSync(path.join(ROOT, 'video')).find(d => d.startsWith(N + '-'));
if (!dir) die(`нет папки video/${N}-*`);
const out = path.join(ROOT, 'video', dir, 'output');
const f = {video: path.join(out, 'video.mp4'), cover: path.join(out, 'cover.jpg'), caption: path.join(out, 'summary-inst.txt'), posted: path.join(out, 'posted.json')};
for (const k of ['video', 'cover', 'caption']) if (!fs.existsSync(f[k])) die(`нет ${path.relative(ROOT, f[k])}`);
if (fs.existsSync(f.posted) && !FORCE) die(`ролик ${N} уже запланирован: ${fs.readFileSync(f.posted, 'utf8').trim()}`);
// без перевода строки в конце: Enter после хэштега выбирает подсказку Instagram и подменяет тег
const caption = fs.readFileSync(f.caption, 'utf8').trim();
if (caption.length > 2200) die(`подпись ${caption.length} символов, лимит Instagram 2200`);
log(`ролик ${dir}, подпись ${caption.length} символов`);

// --- браузер
let b;
try { b = await puppeteer.connect({browserURL: 'http://127.0.0.1:9222', defaultViewport: null, protocolTimeout: 120000}); }
catch { die('порт 9222 закрыт: запусти scripts/yandex-debug.sh', 3); }
const pages = await b.pages();
const p = pages.find(x => x.url().includes('instagram.com')) || await b.newPage();
await p.bringToFront();
await p.goto(URL_SC, {waitUntil: 'networkidle2', timeout: 60000}).catch(() => {});
await sleep(2000);
if (/accounts\/login/.test(p.url())) { b.disconnect(); die('Instagram просит вход: запусти scripts/yandex-debug.sh --fresh (перенесет вход из основного браузера)', 4); }

// клик по видимому элементу с точным текстом или по svg с aria-label
async function click(text, {label = false, nth = 0, within = null, timeout = 15000} = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const r = await p.evaluate((text, label, nth, within) => {
      const root = within ? [...document.querySelectorAll('[role=dialog]')].sort((a, b) => b.innerText.length - a.innerText.length)[0] || document : document;
      let els;
      if (label) els = [...root.querySelectorAll(`svg[aria-label="${text}"]`)].map(s => s.closest('[role=button],button') || s);
      else els = [...root.querySelectorAll('button,[role=button],a,span,div')].filter(e => e.innerText?.trim() == text && ![...e.children].some(c => c.innerText?.trim() == text));
      els = els.filter(e => e.getClientRects().length);
      const e = els[nth]; if (!e) return null;
      const q = e.getBoundingClientRect(); return [q.x + q.width / 2, q.y + q.height / 2];
    }, text, label, nth, within);
    if (r) { await p.mouse.click(r[0], r[1]); return; }
    await sleep(500);
  }
  throw new Error('не найден элемент: ' + text);
}
// снять фокус кликом по заголовку окна (клик по фону вне окна открывает «Отменить публикацию?»)
const blur = () => click('Новое видео Reels', {within: true, timeout: 3000}).catch(() => {});
const has = t => p.evaluate(t => document.body.innerText.replace(/\u00a0/g, ' ').includes(t), t);   // Instagram ставит неразрывные пробелы
async function waitText(t, timeout = 60000) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { if (await has(t)) return; await sleep(700); } throw new Error('не дождался: ' + t); }
const dialogTitle = () => p.evaluate(() => { const d = [...document.querySelectorAll('[role=dialog]')].sort((a, b) => b.innerText.length - a.innerText.length)[0]; return d ? (d.querySelector('h1,h2,[role=heading]')?.innerText || '').trim() : ''; });

// проверка шага скриншотом через Jev
const STEPS = {select: 'Empty upload dialog asking to choose files from computer', crop: 'Crop step, dialog title Обрезать', edit: 'Edit step with cover photo strip, dialog title Редактировать',
  details: 'Caption, AI label and schedule step, dialog title Новое видео Reels', progress: 'Loading spinner, dialog title Планирование', done: 'Success message Видео Reels запланировано', other: 'Calendar or anything else'};
async function jevStep(want) {
  await p.screenshot({path: SHOT});
  const a = await jev(SHOT, {step: {type: 'choice', instructions: 'Which step of the Instagram scheduling dialog is shown on this screenshot?', criteria: STEPS}});
  const s = a.step; log(`Jev: шаг ${s.choice} (${(s.confidence * 100).toFixed(0)}%)`);
  if (s.choice != want) throw new Error(`Jev видит шаг "${s.choice}", ожидался "${want}"`);
}

// --- слот: последняя дата в календаре и в posted.json всех роликов
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
async function lastScheduled() {
  if (await p.evaluate(() => document.body.innerText.includes('По месяцам') && !document.body.innerText.includes('Вс, '))) { await click('По месяцам'); await click('По неделям', {nth: 1}); }
  await click('Сегодня').catch(() => {}); await sleep(1500);
  let last = null;
  for (let w = 0; w < 10; w++) {
    const r = await p.evaluate(() => {
      // «октябрь 2026 г.», «ноябрь – декабрь 2026», «декабрь 2026 – январь 2027»
      const title = [...document.querySelectorAll('span,h1,h2,div')].find(e => !e.children.length && /^[а-я]+[^\n]*\d{4}( г\.)?$/.test(e.innerText?.trim() || ''))?.innerText.trim();
      const hs = [...document.querySelectorAll('span,div')].filter(e => !e.children.length && /^(Вс|Пн|Вт|Ср|Чт|Пт|Сб), \d+$/.test(e.innerText?.trim())).map(e => ({d: +e.innerText.split(', ')[1], x: e.getBoundingClientRect().x}));
      const ts = [...document.querySelectorAll('span,div')].filter(e => !e.children.length && /^\d{1,2}:\d{2}$/.test(e.innerText?.trim())).map(e => { const x = e.getBoundingClientRect().x; let i = -1; hs.forEach((h, k) => { if (h.x <= x + 5) i = k; }); return {i, t: e.innerText.trim()}; });
      return {title, hs: hs.map(h => h.d), ts};
    });
    if (!r.title || r.hs.length != 7) throw new Error('не разобрал календарь: ' + JSON.stringify(r));
    const [, mName, y] = r.title.match(/^([а-я]+)\D*?(\d{4})/); const m = MONTHS.indexOf(mName);
    // заголовок - месяц первого дня недели; переход через границу месяца по убыванию номера дня
    const dates = []; let mm = m, yy = +y;
    r.hs.forEach((d, k) => { if (k && d < r.hs[k - 1]) { mm++; if (mm > 11) { mm = 0; yy++; } } dates.push(new Date(yy, mm, d)); });
    for (const {i, t} of r.ts) if (i >= 0) { const [h, mi] = t.split(':').map(Number); const d = new Date(dates[i]); d.setHours(h, mi); if (!last || d > last) last = d; }
    await click('Следующая неделя', {label: true}); await sleep(1800);
  }
  await click('Сегодня').catch(() => {}); await sleep(800);
  return last;
}
// расписание: 3 ролика в день - 06:00, 08:00, 12:00; следующий ролик - в следующий слот после последнего поста
const SLOTS = [[6, 0], [8, 0], [12, 0]];
let slot;
if (AT) { const [d, t] = AT.split(' '); const [Y, M, D] = d.split('-').map(Number); const [h, mi] = (t || '06:00').split(':').map(Number); slot = new Date(Y, M - 1, D, h, mi); }
else {
  let last = await lastScheduled();
  log('последний пост в календаре: ' + (last ? last.toLocaleString('ru') : 'нет'));
  for (const d of fs.readdirSync(path.join(ROOT, 'video'))) {
    const pj = path.join(ROOT, 'video', d, 'output/posted.json');
    if (fs.existsSync(pj)) { const s = JSON.parse(fs.readFileSync(pj, 'utf8')).scheduled; const t = s && new Date(s); if (t && t > (last || 0)) last = t; }
  }
  // первый свободный слот из SLOTS после последнего поста и не раньше чем через 25 минут от сейчас
  const after = new Date(Math.max(+(last || 0), Date.now() + 25 * 60000 - 1));
  for (let k = 0; !slot; k++) for (const [h, mi] of SLOTS) {
    const d = new Date(after.getFullYear(), after.getMonth(), after.getDate() + k, h, mi);
    if (d > after) { slot = d; break; }
  }
}
if (slot - Date.now() < 25 * 60000) die('время публикации должно быть хотя бы через 20 минут');
const HH = pad(slot.getHours()), MM = pad(slot.getMinutes());
log(`слот: ${iso(slot)} ${HH}:${MM}`);

// --- окно публикации
try {
  await click('Запланировать публикацию контента');
  await sleep(2500);
  const inp = await p.waitForSelector('[role=dialog] input[type=file]', {timeout: 20000});
  await inp.uploadFile(f.video); log('видео загружено');
  await waitText('Обрезать', 60000); await sleep(3000);
  await jevStep('crop');
  // оригинальный размер
  await click('Выбрать размер и обрезать', {label: true}); await sleep(800);
  await click('Оригинал'); await sleep(1200);
  await click('Далее', {within: true});
  await waitText('Фото обложки', 60000); await sleep(1500);
  await jevStep('edit');
  // обложка: в окне один input[type=file] (jpeg/png)
  const ci = await p.waitForSelector('[role=dialog] input[type=file][accept*="image"]', {timeout: 15000});
  await ci.uploadFile(f.cover); await sleep(2500); log('обложка загружена');
  await click('Далее', {within: true});
  await waitText('Добавить подпись', 30000); await sleep(1500);
  await jevStep('details');

  // подпись
  await p.evaluate(() => { const e = document.querySelector('[role=dialog] [contenteditable=true]'); e.focus(); });
  await p.keyboard.type(caption, {delay: 4});
  await sleep(800);
  await blur(); // снять фокус и закрыть подсказки хэштегов
  await sleep(500);
  const got = (await p.evaluate(() => document.querySelector('[role=dialog] [contenteditable=true]').innerText)).trim();
  if (got != caption) throw new Error('подпись не совпала с summary-inst.txt (подсказка хэштегов?):\n' + got.slice(-120));
  log('подпись совпадает с файлом');

  // переключатели: метка ИИ - вкл, планирование - вкл
  const toggles = () => p.evaluate(() => {
    const d = [...document.querySelectorAll('[role=dialog]')].sort((a, b) => b.innerText.length - a.innerText.length)[0];
    const row = t => { const lab = [...d.querySelectorAll('span,div')].find(e => !e.children.length && e.innerText?.trim().startsWith(t)); if (!lab) return null;
      let n = lab; for (let i = 0; i < 6 && n; i++, n = n.parentElement) { const c = n.querySelector('input[type=checkbox]'); if (c) { const q = (c.closest('label,div') || c).getBoundingClientRect(); return {on: c.checked, x: q.x + q.width / 2, y: q.y + q.height / 2}; } } return null; };
    return {ai: row('Добавить метку ИИ'), sch: row('Запланируйте публикацию')};
  });
  let tg = await toggles();
  if (!tg.ai || !tg.sch) throw new Error('не нашел переключатели: ' + JSON.stringify(tg));
  // первый клик после подписи может уйти на закрытие подсказки хэштегов - до 4 попыток
  for (let i = 0; i < 4 && !(tg.ai.on && tg.sch.on); i++) {
    const k = !tg.ai.on ? tg.ai : tg.sch; await p.mouse.click(k.x, k.y); await sleep(900); tg = await toggles();
  }
  if (!tg.ai.on || !tg.sch.on) throw new Error('переключатели не включились: ' + JSON.stringify(tg));
  log('метка ИИ и планирование включены');

  // дата: открыть выпадающий календарь, листать до нужного месяца, кликнуть день
  const dateBox = () => p.evaluate(() => { const e = [...document.querySelectorAll('[role=dialog] span,[role=dialog] div')].find(e => !e.children.length && /^(пн|вт|ср|чт|пт|сб|вс), \d+ [а-я]+\.? \d{4} г\.$/.test(e.innerText?.trim()));
    if (!e) return null; const q = e.getBoundingClientRect(); return {t: e.innerText.trim(), x: q.x + q.width / 2, y: q.y + q.height / 2}; });
  const db = await dateBox(); if (!db) throw new Error('нет поля даты');
  await p.mouse.click(db.x, db.y); await sleep(800);
  const want = `${MONTHS[slot.getMonth()]} ${slot.getFullYear()} г.`;
  for (let i = 0; i < 14; i++) {
    const cur = await p.evaluate(() => [...document.querySelectorAll('[role=dialog] span,[role=dialog] div')].filter(e => !e.children.length && /^[а-я]+ \d{4} г\.$/.test(e.innerText?.trim())).map(e => e.innerText.trim()).pop());
    if (cur == want) break;
    // стрелка вправо в шапке календаря: ближайший кликабельный элемент справа от заголовка месяца
    const ok = await p.evaluate(() => {
      const h = [...document.querySelectorAll('[role=dialog] span,[role=dialog] div')].filter(e => !e.children.length && /^[а-я]+ \d{4} г\.$/.test(e.innerText?.trim())).pop(); if (!h) return null;
      const hq = h.getBoundingClientRect();
      const c = [...document.querySelectorAll('[role=dialog] [role=button],[role=dialog] button,[role=dialog] svg')].map(e => ({e, q: e.getBoundingClientRect()})).filter(o => o.q.width && Math.abs(o.q.y + o.q.height / 2 - hq.y - hq.height / 2) < 20 && o.q.x > hq.right).sort((a, b) => a.q.x - b.q.x)[0];
      if (!c) return null; return [c.q.x + c.q.width / 2, c.q.y + c.q.height / 2];
    });
    if (!ok) throw new Error('нет стрелки месяца в календаре даты');
    await p.mouse.click(ok[0], ok[1]); await sleep(600);
  }
  const day = await p.evaluate(dd => {
    const h = [...document.querySelectorAll('[role=dialog] span,[role=dialog] div')].filter(e => !e.children.length && /^[а-я]+ \d{4} г\.$/.test(e.innerText?.trim())).pop();
    const hq = h.getBoundingClientRect();
    const c = [...document.querySelectorAll('[role=dialog] *')].filter(e => !e.children.length && e.innerText?.trim() == String(dd) && e.tagName != 'LABEL' && !e.closest('[aria-hidden=true]') && e.getBoundingClientRect().y > hq.bottom && e.getClientRects().length);   // не скрытая подпись поля времени (часы = день)
    const q = c[0]?.getBoundingClientRect(); return q ? [q.x + q.width / 2, q.y + q.height / 2] : null;
  }, slot.getDate());
  if (!day) throw new Error('нет дня ' + slot.getDate() + ' в календаре');
  await p.mouse.click(day[0], day[1]); await sleep(800);
  const db2 = await dateBox();
  const wantDay = new RegExp(`, ${slot.getDate()} ${MONTHS[slot.getMonth()].slice(0, 3)}[а-я]*\\.? ${slot.getFullYear()} г\\.`);
  if (!db2 || !wantDay.test(db2.t)) throw new Error('дата не встала: ' + db2?.t);
  log('дата: ' + db2.t);

  // время: два поля Hours и Minutes
  for (const [lab, v] of [['Hours', HH], ['Minutes', MM]]) {
    await p.evaluate(l => document.querySelector(`[role=dialog] input[aria-label=${l}]`).focus(), lab);
    await p.keyboard.type(v, {delay: 40}); await sleep(300);
  }
  await blur(); await sleep(600);
  await p.screenshot({path: SHOT});
  const chk = await jev(SHOT, {
    time: {type: 'noul', instructions: `Does the Время (time) field show exactly ${HH}:${MM}?`},
    date: {type: 'noul', instructions: `Does the Дата (date) field show day ${slot.getDate()}?`},
    ai: {type: 'noul', instructions: 'Is the toggle next to Добавить метку ИИ switched on?'},
    sch: {type: 'noul', instructions: 'Is the toggle next to Запланируйте публикацию контента switched on?'},
    err: {type: 'noul', instructions: 'Is there any red error message in the dialog (for example about time)?'},
  });
  const v = k => chk[k].noul;
  log(`Jev: время ${v('time').toFixed(2)}, дата ${v('date').toFixed(2)}, ИИ ${v('ai').toFixed(2)}, планирование ${v('sch').toFixed(2)}, ошибка ${v('err').toFixed(2)}`);
  if (v('time') < .5 || v('date') < .5 || v('ai') < .5 || v('sch') < .5 || v('err') > .5) throw new Error('Jev не подтвердил форму, скриншот ' + SHOT);
  fs.copyFileSync(SHOT, path.join(out, 'post-form.png'));

  if (DRY) {
    log('--dry: форма заполнена и проверена, «Запланировать» не нажимаю. Скриншот: ' + path.relative(ROOT, path.join(out, 'post-form.png')));
    // закрыть окно без публикации: крестик и «Удалить» (черновик)
    await click('Закрыть', {label: true}); await sleep(800); await click('Удалить', {within: true}).catch(() => {});
    log('окно закрыто, черновик удален');
    b.disconnect(); process.exit(0);
  }

  await click('Запланировать', {within: true});
  await waitText('Видео Reels запланировано', 300000);
  await sleep(800);
  await jevStep('done');
  await click('Готово', {within: true}).catch(() => {});
  const rec = {video: +N, slug: dir, scheduled: `${iso(slot)}T${HH}:${MM}`, account: 'const_proxima', cover: 'cover.jpg', caption: 'summary-inst.txt', ai_label: true, at: new Date().toISOString().slice(0, 16)};
  fs.writeFileSync(f.posted, JSON.stringify(rec, null, 2) + '\n');
  log('запланировано: ' + rec.scheduled + ', записан ' + path.relative(ROOT, f.posted));
} catch (e) {
  await p.screenshot({path: SHOT}).catch(() => {});
  console.error('СТОП: ' + e.message + '\nскриншот: ' + SHOT + '\nокно оставлено как есть, ничего не опубликовано, если не было «Видео Reels запланировано»');
  b.disconnect(); process.exit(1);
}
b.disconnect();
