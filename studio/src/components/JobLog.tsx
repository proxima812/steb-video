import { createSignal, For, onCleanup, Show } from 'solid-js';
import { api, Job } from '../api';

// Лог сборки: опрашивает сервер, пока процесс идет.
export default function JobLog(p: { id: string; onFinish?: (j: Job) => void }) {
  const [lines, setLines] = createSignal<string[]>([]);
  const [job, setJob] = createSignal<Job | null>(null);
  let box!: HTMLPreElement;
  let since = 0, alive = true, timer: number | undefined;

  const tick = async () => {
    try {
      const j = await api.job(p.id, since);
      since = j.total;
      if (j.lines.length) {
        const stick = box.scrollTop + box.clientHeight >= box.scrollHeight - 20;
        setLines(l => [...l, ...j.lines].slice(-800));
        if (stick) queueMicrotask(() => box.scrollTop = box.scrollHeight);
      }
      setJob(j);
      if (j.status !== 'running') { p.onFinish?.(j); return; }
    } catch { /* сервер перезапускается */ }
    if (alive) timer = window.setTimeout(tick, 700);
  };
  tick();
  onCleanup(() => { alive = false; clearTimeout(timer); });

  return (
    <div class="joblog">
      <pre ref={box}><For each={lines()}>{l => <div classList={{ warn: /warn|предупр/i.test(l), err: /error|ошибк|fail/i.test(l) }}>{l}</div>}</For></pre>
      <Show when={job()?.status === 'running'}>
        <button class="btn ghost" onClick={() => api.stopJob(p.id)}><span class="mi">stop</span>Остановить</button>
      </Show>
    </div>
  );
}
