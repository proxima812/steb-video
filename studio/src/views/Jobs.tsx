import { For, Show } from 'solid-js';
import { Job } from '../api';
import JobLog from '../components/JobLog';

export const MODE: Record<string, string> = { check: 'Проверка', preview: 'Превью', final: 'Финал', force: 'Финал заново' };
export const STATUS: Record<Job['status'], string> = { running: 'идет', done: 'готово', error: 'ошибка', stopped: 'остановлено' };

export default function Jobs(p: { jobs?: Job[] }) {
  return (
    <div class="page">
      <h1 class="title">Сборки</h1>
      <Show when={p.jobs?.length} fallback={<div class="empty">Сборок пока не было. Запустить можно из ролика, вкладка «Рендер».</div>}>
        <div class="stack">
          <For each={p.jobs}>{j =>
            <div class="card job">
              <div class="row">
                <a href={`#/v/${j.video}`} class="name">{j.video}</a>
                <span class="muted">{MODE[j.mode] || j.mode}</span>
                <span class={'chip st-' + j.status}>{STATUS[j.status]}</span>
              </div>
              <JobLog id={j.id} />
            </div>}
          </For>
        </div>
      </Show>
    </div>
  );
}
