import { onCleanup } from 'solid-js';

let pending: (() => boolean) | undefined;
export const canLeave = () => !pending?.() || window.confirm('Есть несохраненные изменения или идет загрузка. Покинуть страницу?');
export function protectDraft(dirty: () => boolean) {
  pending = dirty;
  const unload = (event: BeforeUnloadEvent) => {
    if (dirty()) { event.preventDefault(); event.returnValue = ''; }
  };
  window.addEventListener('beforeunload', unload);
  onCleanup(() => {
    if (pending === dirty) pending = undefined;
    window.removeEventListener('beforeunload', unload);
  });
}
