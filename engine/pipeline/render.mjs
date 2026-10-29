import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {openPage, renderOptions, writeJSON} from '../pipeline/video-tools.mjs';

const [mode, ...times] = process.argv.slice(2), E = process.env;
const options = renderOptions(E);
const {browser, page, errors} = await openPage(path.resolve(E.PAGE || 'examples/index.html'));
try {
  if (errors.length) throw new Error(errors.map(e => e.message).join('\n'));
  const seek = async time => {
    await page.evaluate(async ({time, settle}) => {
      window.render(time);
      for (let i = 0; i < settle; i++) await new Promise(requestAnimationFrame);
    }, {time, settle: options.settle});
  };
  if (mode === 'stills') {
    for (const time of times) {
      if (!Number.isFinite(+time) || +time < 0) throw new Error(`Invalid still time: ${time}`);
      await seek(+time);
      const file = `${E.SP || 'still'}_${time}.png`;
      await fs.mkdir(path.dirname(file), {recursive: true});
      await page.screenshot({path: file});
    }
  } else {
    const {fps, scale, start, frames, duration, quality} = options;
    const out = path.resolve(E.OUT || 'raw.mp4'), temp = out.replace(/\.mp4$/i, '') + `.${process.pid}.partial.mp4`;
    await fs.mkdir(path.dirname(out), {recursive: true});
    const audio = Boolean(E.AUDIO) && E.AUDIO !== 'none';
    const args = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-'];
    if (audio) args.push('-ss', String(start), '-i', E.AUDIO, '-af', 'apad');
    args.push('-t', String(duration), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18');
    if (E.PREVIEW === '1') args.push('-preset', 'veryfast');
    if (audio) args.push('-c:a', 'aac', '-b:a', '192k');
    args.push('-movflags', '+faststart', temp);
    const ff = spawn('ffmpeg', args, {stdio: ['pipe', 'ignore', 'pipe']});
    let failure, stderr = '';
    const completed = new Promise(resolve => {
      ff.once('error', e => { failure = e; resolve(-1); });
      ff.once('close', resolve);
    });
    ff.stdin.on('error', e => { failure = e; });
    ff.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-12000); });
    const stats = {frames, fps, width: 1080 * scale, height: 1920 * scale, start, duration,
      seekMs: 0, screenshotMs: 0, backpressureMs: 0};
    const begun = performance.now();
    try {
      for (let i = 0; i < frames; i++) {
        if (failure || ff.exitCode !== null) throw failure || new Error(stderr || 'ffmpeg exited early');
        let mark = performance.now();
        await seek(start + i / fps);
        stats.seekMs += performance.now() - mark;
        mark = performance.now();
        const buffer = await page.screenshot({type: 'jpeg', quality,
          clip: {x: 0, y: 0, width: 1080, height: 1920, scale}});
        stats.screenshotMs += performance.now() - mark;
        mark = performance.now();
        if (!ff.stdin.write(buffer)) await new Promise((resolve, reject) => {
          const clean = () => { ff.stdin.off('drain', drained); ff.stdin.off('error', failed); ff.off('close', closed); };
          const drained = () => { clean(); resolve(); };
          const failed = e => { clean(); reject(e); };
          const closed = () => { clean(); reject(new Error(stderr || 'ffmpeg closed its input')); };
          ff.stdin.once('drain', drained); ff.stdin.once('error', failed); ff.once('close', closed);
        });
        stats.backpressureMs += performance.now() - mark;
        if (i % 150 === 0) console.log(`${i}/${frames}`);
      }
      ff.stdin.end();
      const code = await completed;
      if (failure || code !== 0) throw new Error(`ffmpeg failed (${code}): ${failure?.message || stderr}`);
      if (errors.length) throw new Error(errors.map(e => e.message).join('\n'));
      await fs.rename(temp, out);
      stats.elapsedSeconds = (performance.now() - begun) / 1000;
      stats.framesPerSecond = frames / stats.elapsedSeconds;
      await writeJSON(`${out}.render.json`, stats);
      console.log(`Rendered ${frames} frames in ${stats.elapsedSeconds.toFixed(2)}s (${stats.framesPerSecond.toFixed(1)} fps)`);
    } finally {
      if (ff.exitCode === null) ff.kill('SIGTERM');
      await completed;
      await fs.rm(temp, {force: true});
    }
  }
} finally { await browser.close(); }
