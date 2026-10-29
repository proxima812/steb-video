// Validate a standalone direction JSON or the #scene-direction block before rendering HTML.
import fs from 'node:fs/promises';
import '../components/p5-direction.js';
const [file,wordsFile]=process.argv.slice(2);
try {
  if(!file)throw new Error('Usage: node engine/checks/scene-direction.mjs <direction.json|v.html> [words.json]');
  const input=await fs.readFile(file,'utf8');
  const source=/\.html?$/i.test(file)?input.match(/<script\b[^>]*\bid=["']scene-direction["'][^>]*>([\s\S]*?)<\/script>/i)?.[1]:input;
  if(!source)throw new Error('Missing #scene-direction JSON block');
  const doc=JSON.parse(source),words=wordsFile?JSON.parse(await fs.readFile(wordsFile,'utf8')):undefined;
  const report=P5Direction.validate(doc,{words});
  console.log(JSON.stringify(report,null,2));if(!report.ok)process.exitCode=1;
}catch(e){console.error(e.message);process.exitCode=1}
