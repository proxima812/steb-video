// LaTeX -> SVG прямо в v.html (MathJax 3, без внешних запросов). Формулы в ролике не собираем руками из HTML и Unicode.
// В v.html: <div class="tex" id="f1"><!--tex x_t=\sqrt{\bar\alpha_t}x_0--><!--/tex--></div>
// Запуск из корня: node engine/pipeline/tex2svg.mjs video/N-slug [файл.html]
// Между маркерами вставляется SVG (повторный запуск перерисовывает). Исходник LaTeX остается в комментарии.
// Части формулы для камеры и анимации: \cssId{qk}{QK^T} -> элемент #qk внутри SVG, \class{bb-part}{...} -> класс.
// Цвет - currentColor (берется из CSS), размер - font-size контейнера (1ex SVG = ~0.43em).
import fs from 'fs';
import path from 'path';
import {mathjax} from 'mathjax-full/js/mathjax.js';
import {TeX} from 'mathjax-full/js/input/tex.js';
import {SVG} from 'mathjax-full/js/output/svg.js';
import {liteAdaptor} from 'mathjax-full/js/adaptors/liteAdaptor.js';
import {RegisterHTMLHandler} from 'mathjax-full/js/handlers/html.js';
import {AllPackages} from 'mathjax-full/js/input/tex/AllPackages.js';

const [dir, name = 'v.html'] = process.argv.slice(2);
if (!dir) { console.log('node engine/pipeline/tex2svg.mjs video/N-slug [v.html]'); process.exit(1); }
const file = path.join(dir, name);
const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const doc = mathjax.document('', {InputJax: new TeX({packages: AllPackages}), OutputJax: new SVG({fontCache: 'none'})});
let n = 0;
const html = fs.readFileSync(file, 'utf8').replace(/<!--tex ([\s\S]*?)-->[\s\S]*?<!--\/tex-->/g, (_, tex) => {
  const node = doc.convert(tex.trim(), {display: true});
  const svg = adaptor.innerHTML(node).replace(/<svg /, '<svg aria-hidden="true" ');
  if (/data-mjx-error|merror/.test(svg)) throw new Error(`LaTeX: ошибка в формуле ${tex.trim()}`);
  n++;
  return `<!--tex ${tex}-->${svg}<!--/tex-->`;
});
fs.writeFileSync(file, html);
console.log(`${file}: ${n} формул`);
