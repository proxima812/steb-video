import fs from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {ENGINE, StageCache, readJSON, writeJSON, renderOptions, run, probe} from '../pipeline/video-tools.mjs';
import {checkVideo, checkMedia} from '../checks/check.mjs';
import {renderParallel, layoutCheck, motionCheck, classCheck} from '../pipeline/pipeline-steps.mjs';

const {values: flags, positionals} = parseArgs({allowPositionals: true, options: {
  preview: {type: 'boolean'}, force: {type: 'boolean'}, 'check-only': {type: 'boolean'},
  'no-sfx': {type: 'boolean'}, help: {type: 'boolean'},
  page: {type: 'string'}, voice: {type: 'string'}, music: {type: 'string'},
  from: {type: 'string'}, to: {type: 'string'}, duration: {type: 'string'},
}});
const usage = `Usage: node engine/pipeline/video.mjs <number|video-folder> [options]
  --preview             540x960, 15 fps; layout stays 1080x1920
  --from 12 --to 18      Render/check this interval only (seconds)
  --check-only          Validate HTML, resources and words without rendering
  --page path           Scene HTML (default: video/N-slug/v.html)
  --voice path          Existing voice audio (auto-detected when unambiguous)
  --music path|none     Background music (auto-detected in music/)
  --duration seconds    Total timeline duration (default: voice + 1.5s)
  --no-sfx              Disable sound effects
  --force               Rebuild stages, ignoring cached results
Optional video.json in the video folder: page, voice, music, duration, noSfx.
Paths in video.json are relative to that folder; command-line paths are relative to cwd.`;

async function findFolder(input) {
  if (!/^\d+$/.test(input)) return path.resolve(input);
  const root = path.resolve(ENGINE, '../video');
  const matches = (await fs.readdir(root, {withFileTypes: true})).filter(e => e.isDirectory() && e.name.startsWith(`${input}-`));
  if (matches.length !== 1) throw new Error(`Expected one video/${input}-* folder; found ${matches.length}`);
  return path.join(root, matches[0].name);
}
async function findAudio(dir, pattern, label, optional = false) {
  let files;
  try { files = (await fs.readdir(dir)).filter(name => pattern.test(name)); }
  catch (e) { if (optional && e.code === 'ENOENT') return null; throw e; }
  if (optional && !files.length) return null;
  if (files.length !== 1) throw new Error(`${label}: found ${files.length} files in ${dir}; specify the path explicitly`);
  return path.join(dir, files[0]);
}
async function soundFiles(dirs) {
  const files = [];
  for (const dir of dirs) {
    let entries;
    try { entries = await fs.readdir(dir, {withFileTypes: true}); }
    catch (e) { if (e.code === 'ENOENT') continue; throw e; }
    files.push(...entries.filter(e => e.isFile() && /\.mp3$/i.test(e.name)).map(e => path.join(dir, e.name)));
  }
  return files;
}
async function main() {
  if (flags.help) { console.log(usage); return; }
  if (positionals.length !== 1) throw new Error(usage);
  const folder = await findFolder(positionals[0]);
  const config = await readJSON(path.join(folder, 'video.json'), {});
  const number = path.basename(folder).match(/^(\d+)-/)?.[1];
  const configPath = key => config[key] ? path.resolve(folder, config[key]) : null;
  const page = flags.page ? path.resolve(flags.page) : configPath('page') || path.join(folder, 'v.html');
  if (!page) throw new Error('Specify --page or video.json page');
  await fs.access(page);
  const voice = flags.voice ? path.resolve(flags.voice) : configPath('voice') ||
    await findAudio(folder, /^(ElevenLabs_.*|.*voice.*)\.(mp3|wav|m4a)$/i, 'Voice');
  const musicOption = flags.music ?? config.music;
  const music = musicOption === 'none' ? null : musicOption ?
    (flags.music ? path.resolve(flags.music) : configPath('music')) :
    await findAudio(path.join(folder, 'music'), /\.(mp3|wav|m4a|flac)$/i, 'Music', true);
  const voiceDuration = Number((await probe(voice)).format.duration);
  const total = Number(flags.duration ?? config.duration ?? (voiceDuration + 1.5));
  const env = {...process.env, PAGE: page, DUR: String(total), FROM: flags.from ?? '0',
    TO: flags.to ?? String(total), PREVIEW: flags.preview ? '1' : '0'};
  const options = renderOptions(env);
  const {start, duration, fps, scale} = options;
  const partial = flags.from !== undefined || flags.to !== undefined;
  const variant = flags.preview ? (partial ? `preview-${flags.from ?? 0}-${flags.to ?? total}` : 'preview') :
    partial ? `clip-${flags.from ?? 0}-${flags.to ?? total}` : '';
  const outputRoot = path.join(folder, 'output'), output = path.join(outputRoot, variant);
  await fs.mkdir(outputRoot, {recursive: true});
  // Serialize runs for this video, including preview variants sharing the audio cache.
  const lockFile = path.join(outputRoot, '.pipeline.lock');
  let lock;
  try { lock = await fs.open(lockFile, 'wx'); }
  catch (e) {
    if (e.code !== 'EEXIST') throw e;
    const pid = Number(await fs.readFile(lockFile, 'utf8'));
    if (!Number.isInteger(pid) || pid <= 0) throw new Error(`Invalid lock: ${lockFile}`);
    try { process.kill(pid, 0); throw new Error(`Video pipeline already running (PID ${pid})`); }
    catch (err) { if (err.code !== 'ESRCH') throw err; }
    await fs.rm(lockFile);
    lock = await fs.open(lockFile, 'wx');
  }
  const timings = {}, begun = performance.now();
  try {
    await lock.writeFile(String(process.pid));
    await fs.mkdir(output, {recursive: true});
    const wordsFile = path.join(folder, 'words.json');
    const words = await readJSON(wordsFile, null);
    console.log(`Checking ${path.basename(page)} [${start.toFixed(3)}..${(start + duration).toFixed(3)}]`);
    const report = await checkVideo(page, {duration: total, from: start, to: start + duration,
      words: words === null ? undefined : wordsFile});
    timings.check = {seconds: (performance.now() - begun) / 1000};
    await writeJSON(path.join(output, 'pipeline-layout-check.json'), report);
    for (const warning of report.warnings) console.warn(`Warning: ${JSON.stringify(warning)}`);
    if (!report.ok) throw new Error(`Validation failed (${report.errors.length}):\n${JSON.stringify(report.errors.slice(0, 12), null, 2)}`);
    const layoutStarted = performance.now();
    const layoutWarnings = await layoutCheck(page, path.join(output, 'pipeline-frame-layout.json'));
    const classWarnings = await classCheck(page, report.dependencies);
    timings.layout = {seconds: (performance.now() - layoutStarted) / 1000};
    for (const w of [...layoutWarnings, ...classWarnings]) console.warn(`Warning: ${w}`);
    if (flags['check-only']) {
      console.log(`Checked ${report.samples} samples, ${report.checkedElements} content boxes; ` +
        `layout: ${layoutWarnings.length} замечаний, классы движка: ${classWarnings.length}`);
      return;
    }
    if (!Number.isFinite(voiceDuration) || total + .1 < voiceDuration) throw new Error('Timeline duration truncates the voice; use --from/--to to render a clip');
    const cache = new StageCache(path.join(output, '.pipeline'));
    const stage = async (name, inputs, outputs, action) => {
      const result = await cache.run(name, inputs, outputs, action, flags.force);
      timings[name] = result;
      console.log(`${name}: ${result.cached ? 'cache' : `${result.seconds.toFixed(2)}s`}`);
      return result;
    };
    const toolsFile = path.join(ENGINE, 'pipeline/video-tools.mjs'), pipelineFile = path.join(ENGINE, 'pipeline/video.mjs');
    const ffmpegVersion = (await run('ffmpeg', ['-version'])).stdout.split('\n')[0];
    const silent = path.join(output, 'silent.mp4');
    await stage('video', {files: [...report.dependencies, toolsFile, path.join(ENGINE, 'pipeline/render.mjs'), path.join(ENGINE, 'pipeline/pipeline-steps.mjs')],
      values: {options, remote: report.remote, ffmpegVersion, browserVersion: report.browserVersion, chrome: process.env.CHROME,
        disableGPU: process.env.DISABLE_GPU, node: process.version}}, [silent, `${silent}.render.json`], async () => {
      console.log(await renderParallel({env, options, out: silent}));
    });
    const audioRoot = path.join(outputRoot, '.pipeline');
    await fs.mkdir(audioRoot, {recursive: true});
    const cueFile = path.join(audioRoot, 'cues.json'), mix = path.join(audioRoot, 'mix.wav');
    const noSfx = flags['no-sfx'] || config.noSfx || report.preset === 'base';
    const cues = noSfx ? [] : report.cues;
    await writeJSON(cueFile, cues);
    const mixer = path.join(ENGINE, report.preset === 'p4' ? 'audio/p4-audio.mjs' : 'audio/p5-audio.mjs');
    const sfx = path.join(folder, 'sfx');
    const audioInputs = {files: [voice, mixer, toolsFile, ...(music ? [music] : []),
      ...(cues.length ? await soundFiles([sfx, path.resolve(ENGINE, '../sfx'), path.join(ENGINE, 'sfx-p4')]) : [])],
      values: {total, cues, musicVolume: env.MUSIC_VOL, fxVolume: env.FX_VOL, ffmpegVersion}};
    timings.audio = await new StageCache(audioRoot).run('audio', audioInputs, [mix], async () => {
      const temp = path.join(audioRoot, 'mix.partial.wav');
      try {
        await run(process.execPath, [mixer], {env: {...env, DUR: String(total), VOICE: voice,
          MUSIC: music || '', SFX: sfx, CUES: cueFile, NOSFX: noSfx ? '1' : '', OUT: temp}});
        await fs.rename(temp, mix);
      } finally { await fs.rm(temp, {force: true}); }
    }, flags.force);
    console.log(`audio: ${timings.audio.cached ? 'cache' : `${timings.audio.seconds.toFixed(2)}s`}`);
    const video = path.join(output, 'video.mp4');
    await stage('mux', {files: [silent, mix, pipelineFile], values: {start, duration, ffmpegVersion}}, [video], async () => {
      const temp = path.join(output, 'video.partial.mp4');
      try {
        await run('ffmpeg', ['-v', 'error', '-y', '-i', silent, '-ss', start, '-i', mix,
          '-map', '0:v:0', '-map', '1:a:0', '-t', duration, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', temp]);
        await fs.rename(temp, video);
      } finally { await fs.rm(temp, {force: true}); }
    });
    const media = await checkMedia(video, {fps, width: 1080 * scale, height: 1920 * scale, duration});
    await writeJSON(path.join(output, 'pipeline-media-check.json'), media);
    if (!media.ok) throw new Error(JSON.stringify(media.errors));
    const reviewDir = path.join(output, 'pipeline-review');
    const frames = new Set([0, Math.min(Math.round(duration * fps / 2), options.frames - 1)]);
    for (const scene of report.scenes) for (const boundary of [scene.start, scene.end]) {
      const frame = Math.round((boundary - start) * fps);
      for (const n of [frame - 1, frame + 1]) if (n >= 0 && n < options.frames) frames.add(n);
    }
    for (const scene of report.scenes) for (const time of scene.punches) {
      const n = Math.round((time - start) * fps);
      if (n >= 0 && n < options.frames) frames.add(n);
    }
    const frameList = [...frames].sort((a, b) => a - b);
    const images = frameList.map((_, i) => path.join(reviewDir, `${String(i + 1).padStart(3, '0')}.jpg`));
    const cover = path.join(output, 'cover.jpg');
    await stage('review', {files: [video, pipelineFile], values: {frameList}}, [cover, ...images], async () => {
      await fs.mkdir(reviewDir, {recursive: true});
      for (const file of await fs.readdir(reviewDir)) if (/^\d{3}\.jpg$/.test(file)) await fs.rm(path.join(reviewDir, file));
      await run('ffmpeg', ['-v', 'error', '-y', '-i', video, '-vf', `select='${frameList.map(n => `eq(n,${n})`).join('+')}'`,
        '-fps_mode', 'vfr', path.join(reviewDir, '%03d.jpg')]);
      await run('ffmpeg', ['-v', 'error', '-y', '-ss', Math.min(.8, duration / 2), '-i', video, '-frames:v', '1', cover]);
    });
    const motion = flags.preview || partial ? null : await motionCheck(video, path.join(output, 'pipeline-motion.txt'));
    if (motion) for (const d of motion.details) console.warn(`Warning: ${d}`);
    const volume = await run('ffmpeg', ['-hide_banner', '-i', video, '-vn', '-af', 'volumedetect', '-f', 'null', '-']);
    const maxVolume = volume.stderr.match(/max_volume:\s*(-?[\d.]+|-inf) dB/)?.[1];
    await writeJSON(path.join(output, 'pipeline-timings.json'), {...timings, elapsedSeconds: (performance.now() - begun) / 1000});
    await fs.writeFile(path.join(output, 'pipeline-review.md'), `# Автоматическая проверка\n\n` +
      `- HTML: ${report.samples} моментов, ${report.checkedElements} проверок границ контента.\n` +
      `- MP4: H.264, ${1080 * scale}x${1920 * scale}, ${fps} fps, AAC, ${duration.toFixed(3)} с.\n` +
      `- Пиковая громкость готового микса: ${maxVolume ?? 'не определена'} dBFS.\n` +
      `- Кадры из MP4: pipeline-review/, соответствие: ${frameList.map((n, i) => `${i + 1} = ${(start + n / fps).toFixed(3)} с`).join('; ')}.\n` +
      `- Предупреждения проверки сцен: ${report.warnings.length}; см. pipeline-layout-check.json.\n` +
      `- Планировка (frame-layout): ${layoutWarnings.length ? layoutWarnings.map(w => `\n  - ${w}`).join('') : 'по нормам'}; см. pipeline-frame-layout.json.\n` +
      `- Классы движка в стилях ролика: ${classWarnings.length ? classWarnings.map(w => `\n  - ${w}`).join('') : 'совпадений нет'}.\n` +
      `- Рывки (motion-check): ${motion ? `${motion.jerks} рывков, ${motion.cuts} резких смен${motion.details.length ? motion.details.map(d => `\n  - ${d}`).join('') : ''}; см. pipeline-motion.txt` : 'только для финальной сборки'}.\n\n` +
      `Плавность, смысл визуалов, перекрытия элементов и разборчивость голоса требуют просмотра и прослушивания. Автоматический отчет их не подтверждает.\n`);
    if (maxVolume === undefined || Number(maxVolume) >= 0) throw new Error(`Audio peak check failed: ${maxVolume}`);
    const issues = report.warnings.length + layoutWarnings.length + classWarnings.length + (motion && !motion.ok ? 1 : 0);
    console.log(`Checks: сцены ${report.warnings.length}, планировка ${layoutWarnings.length}, классы ${classWarnings.length}, ` +
      `рывки ${motion ? `${motion.jerks}${motion.ok ? '' : ' (выше нормы)'}` : '-'}; ${issues ? 'замечания в pipeline-review.md' : 'все по нормам'}`);
    console.log(`Output: ${video}`);
  } finally { await lock.close(); await fs.rm(lockFile, {force: true}); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
