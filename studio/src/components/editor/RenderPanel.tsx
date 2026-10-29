// Сборка ролика через engine/pipeline/video.mjs и отчеты конвейера.
import { Show } from 'solid-js';
import type { Job, VideoDetail } from '../../api';
import JobLog from '../JobLog';
import { MODE, STATUS } from '../../views/Jobs';

export default function RenderPanel(p: { detail: VideoDetail; job: Job | null; scene: { s: number; e: number; index: number } | null; onRender: (mode: string, range?: [number, number]) => void; onFinish: (j: Job) => void }) {
  return (
    <div class="pane">
      <div class="render-btns">
        <button class="btn" onClick={() => p.onRender('check')}><span class="mi">rule</span>Проверка</button>
        <button class="btn" onClick={() => p.onRender('preview')}><span class="mi">slow_motion_video</span>Превью</button>
        <Show when={p.scene}>{s => <button class="btn" onClick={() => p.onRender('preview', [s().s, s().e])}><span class="mi">crop</span>Превью сцены {s().index + 1}</button>}</Show>
        <button class="btn primary" onClick={() => p.onRender('final')}><span class="mi">movie</span>Финал</button>
      </div>
      <Show when={p.job} fallback={<div class="muted">Сборок этого ролика еще не было.</div>}>{j =>
        <>
          <div class="row"><b class="grow">{MODE[j().mode]} · {j().args.slice(2).join(' ')}</b><span class={'chip st-' + j().status}>{STATUS[j().status]}</span></div>
          <JobLog id={j().id} onFinish={p.onFinish} />
        </>}
      </Show>
      <Show when={p.detail.review}><div class="group-h">output/pipeline-review.md</div><pre class="pre">{p.detail.review}</pre></Show>
      <Show when={p.detail.plan}><div class="group-h">output/plan.md</div><pre class="pre">{p.detail.plan}</pre></Show>
    </div>
  );
}
