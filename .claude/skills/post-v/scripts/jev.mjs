// Проверка скриншота через Jev (TypeSafe). Ключ TYPESAFE_KEY из .env проекта.
// node jev.mjs <png> '<json вопросов>'  ->  JSON ответов
// пример вопросов: {"ok":{"type":"noul","instructions":"Открыто окно публикации с подписью?"}}
import fs from 'fs';
import {execFileSync} from 'child_process';
export async function jev(png, questions) {
  const env = fs.readFileSync(new URL('../../../../.env', import.meta.url), 'utf8');
  const key = (env.match(/^TYPESAFE_KEY=(.*)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, '');
  if (!key) throw new Error('нет TYPESAFE_KEY в .env');
  // Jev принимает картинки до ~1024px: уменьшаем копию через sips
  const small = '/tmp/postv/jev.png'; execFileSync('sips', ['-Z', '1024', png, '--out', small], {stdio: 'ignore'});
  const body = {model: 'jev-preview', state: 'screen', questions,
    assets: {screen: {type: 'image', format: 'png', data_base64: fs.readFileSync(small).toString('base64')}}};
  const r = await fetch('https://api.typesafe.ai/v1/systemone', {method: 'POST',
    headers: {'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'TypeSafe-Danger-Zone-Images': 'true'},
    body: JSON.stringify(body)});
  const j = await r.json();
  if (!r.ok) throw new Error('Jev ' + r.status + ': ' + JSON.stringify(j));
  return j.answers;
}
import {fileURLToPath} from 'url';
if (fileURLToPath(import.meta.url) == process.argv[1]) console.log(JSON.stringify(await jev(process.argv[2], JSON.parse(process.argv[3])), null, 1));
