// Load before runtime/preset-dynamic.js, runtime/preset-minimal.js and init(). No timers or new runtime.
(() => {
  const themes = ['black', 'white'];
  const escape = value => String(value).replace(/[&<>"']/g, c =>
    ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const fail = message => { throw new Error(`P5Blocks: ${message}`); };
  function text(value, field, limit) {
    if (typeof value !== 'string' || !value.trim() || value.length > limit) fail(`${field}: expected 1..${limit} characters`);
    if (/[\u0451\u0401\u2014\u2013]/.test(value)) fail(`${field}: use е/Е and a regular hyphen`);
    return value.trim();
  }
  function number(value, field, min = 0) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min) fail(`${field}: expected a finite number >= ${min}`);
    return value;
  }
  function interval(scene, at, duration = .3) {
    number(at, 'at'); number(duration, 'duration', .001);
    if (at < scene.start || at + duration > scene.end) fail('animation must fit inside the scene interval');
  }
  function phrase(value, scene, tag, className, limit) {
    const content = text(value?.text, 'phrase.text', limit), words = content.split(/\s+/);
    const times = value.times;
    if (!Array.isArray(times) || times.length !== words.length) fail('one absolute timestamp is required for each word');
    times.forEach((at, i) => {
      interval(scene, at);
      if (i && at < times[i - 1]) fail('word timestamps must be ordered');
    });
    const style = tag === 'h2' ? 'font-size:72px;line-height:1.08;overflow-wrap:anywhere' : 'font-size:40px;overflow-wrap:anywhere';
    return `<${tag} class="${className}" style="${style}" data-wd="${times[0]},0" data-wd-times="${times.join(',')}">${escape(content)}</${tag}>`;
  }
  function list(value, field, min, max) {
    if (!Array.isArray(value) || value.length < min || value.length > max) fail(`${field}: expected ${min}..${max} items`);
    return value;
  }
  function terminal(scene) {
    const lines = list(scene.lines, 'lines', 1, 4);
    const rows = lines.map((line, i) => {
      const code = text(line.text, `lines[${i}].text`, 60);
      interval(scene, line.at, line.duration);
      if (line.duration === undefined) fail('terminal lines require duration');
      const kind = line.kind ?? 'command';
      if (!['command', 'result', 'comment'].includes(kind)) fail('unknown terminal line kind');
      const color = {command: 'k', result: 'n', comment: 'c'}[kind];
      return `<div class="${color}" data-in="${line.at}" data-a="soft" data-d=".25" style="min-height:104px;white-space:pre-wrap;overflow-wrap:anywhere">` +
        `<span data-type="${escape(code)}" data-t0="${line.at}" data-cps="${code.length / line.duration}"></span></div>`;
    }).join('');
    const at = Math.max(scene.start, Math.min(...lines.map(line => line.at)) - .25);
    return `<div class="code5 mono" data-safe data-in="${at}" data-a="soft" style="font-size:36px;line-height:1.45">` +
      `<div class="mono" style="font-size:26px;margin-bottom:24px;display:flex;align-items:center;gap:12px"><i class="mi">terminal</i>${escape(text(scene.label ?? 'terminal', 'label', 28))}</div>${rows}</div>`;
  }
  function comparison(scene) {
    const columns = list(scene.columns, 'columns', 2, 2);
    return `<div class="grid2" style="gap:24px;align-items:stretch">${columns.map((column, i) => {
      interval(scene, column.at);
      return `<article class="card" data-safe data-in="${column.at}" data-a="soft" style="min-width:0;padding:32px;display:flex;flex-direction:column;gap:24px;overflow-wrap:anywhere">` +
        `<div class="mut" style="font-size:32px;line-height:1.2">${escape(text(column.label, 'column.label', 24))}</div>` +
        `<div class="mono ${i === 1 ? 'acc' : ''}" style="font-size:60px;line-height:1.1">${escape(text(column.value, 'column.value', 12))}</div>` +
        `<div style="font-size:34px;line-height:1.3">${escape(text(column.description, 'column.description', 72))}</div></article>`;
    }).join('')}</div>`;
  }
  function chartData(scene) {
    const bars = list(scene.bars, 'bars', 1, 4);
    for (const bar of bars) {
      number(bar.value, 'bar.value');
      if (!Number.isInteger(bar.value) || bar.value > 1e9) fail('chart values must be integers between 0 and 1e9');
      interval(scene, bar.at, bar.duration);
      if (bar.duration === undefined) fail('chart bars require duration');
    }
    const max = scene.max ?? Math.max(1, ...bars.map(bar => bar.value));
    number(max, 'max', .001);
    if (bars.some(bar => bar.value > max)) fail('chart max must include every value');
    const unit = scene.unit === undefined ? '' : ` ${text(scene.unit, 'unit', 6)}`;
    return {bars, max, unit};
  }
  function chart(scene) {
    const {bars, max, unit} = chartData(scene);
    const at = Math.max(scene.start, Math.min(...bars.map(bar => bar.at)) - .25);
    return `<div class="card" data-safe data-in="${at}" data-a="soft" style="display:flex;flex-direction:column;gap:30px">${bars.map(bar => {
      const end = bar.at + bar.duration;
      return `<div data-in="${bar.at}" data-a="soft"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:16px">` +
        `<span style="font-size:40px;max-width:52%;overflow-wrap:anywhere">${escape(text(bar.label, 'bar.label', 24))}</span>` +
        `<span class="mono acc" style="font-size:36px;white-space:nowrap" data-cnt="${bar.at},${end},0,${bar.value}" data-suf="${escape(unit)}"></span></div>` +
        `<div class="track" style="height:28px;background:var(--tile);margin-top:16px"><i style="background:var(--acc)" data-w="${bar.at},${end},0,${bar.value / max * 100}"></i></div></div>`;
    }).join('')}</div>`;
  }
  function threePanel(kind, spec, content, at, duration) {
    return `<div class="card" data-safe data-in="${at}" data-a="soft" style="padding:28px 40px;display:flex;flex-direction:column;gap:20px">` +
      `<canvas data-three="${kind}" data-three-at="${at}" data-three-duration="${duration}" data-three-spec="${escape(JSON.stringify(spec))}" width="800" height="320" style="display:block;width:100%;height:320px" aria-label="3D ${kind}"></canvas>${content}</div>`;
  }
  function chart3d(scene) {
    const {bars, max, unit} = chartData(scene);
    const first = Math.min(...bars.map(bar => bar.at)), end = Math.max(...bars.map(bar => bar.at + bar.duration));
    const labels = `<div class="grid2">${bars.map(bar => `<div data-in="${bar.at}" data-a="soft" style="min-width:0">` +
      `<div style="font-size:28px;overflow-wrap:anywhere">${escape(text(bar.label, 'bar.label', 24))}</div>` +
      `<div class="mono acc" style="font-size:34px" data-cnt="${bar.at},${bar.at + bar.duration},0,${bar.value}" data-suf="${escape(unit)}"></div></div>`).join('')}</div>`;
    return threePanel('bars', {bars: bars.map(({value, at, duration}) => ({value, at, duration})), max}, labels, first, end - first);
  }
  function layers3d(scene) {
    const layers = list(scene.layers, 'layers', 2, 5).map((label, i) => text(label, `layers[${i}]`, 24));
    interval(scene, scene.at, scene.duration);
    if (scene.duration === undefined) fail('3D layers require duration');
    const labels = `<div class="grid2">${layers.map((label, i) => `<div data-in="${scene.at + i * scene.duration / layers.length}" data-a="soft" style="font-size:28px;overflow-wrap:anywhere"><span class="acc">${i + 1}.</span> ${escape(label)}</div>`).join('')}</div>`;
    return threePanel('layers', {count: layers.length, at: scene.at, duration: scene.duration}, labels, scene.at, scene.duration);
  }
  const builders = {terminal, comparison, chart, chart3d, layers3d};
  function render(scenes) {
    list(scenes, 'scenes', 1, 100);
    let previousEnd = -Infinity;
    return scenes.map((scene, i) => {
      number(scene.start, 'start'); number(scene.end, 'end');
      if (scene.end <= scene.start) fail('end must be greater than start');
      if (scene.start < previousEnd) fail('scene intervals overlap or are out of order');
      previousEnd = scene.end;
      if (!Object.hasOwn(builders, scene.type)) fail('unknown block type');
      const theme = scene.theme ?? themes[i % themes.length];
      if (!themes.includes(theme)) fail('unknown theme');
      const title = phrase(scene.title, scene, 'h2', 'h2', 48);
      const body = builders[scene.type](scene);
      const caption = scene.caption ? phrase(scene.caption, scene, 'p', 'p mut', 70) : '';
      return `<section class="s ${theme}" data-block="${scene.type}" data-s="${scene.start}" data-e="${scene.end}" data-deco="none" data-tr="${i ? 'wipe' : 'cut'}">` +
        `<div style="width:880px;max-width:100%;align-self:center;display:flex;flex-direction:column;gap:32px">${title}${body}${caption}</div></section>`;
    }).join('\n');
  }
  function mount(scenes, target = document.body) {
    if (typeof globalThis.p5cues === 'function' || typeof globalThis.p4cues === 'function') fail('mount blocks before loading the animation presets');
    const html = render(scenes);
    target.insertAdjacentHTML('beforeend', html);
  }
  globalThis.P5Blocks = Object.freeze({render, mount});
})();
