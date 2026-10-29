// Сохранение черновика: на диск уходит снимок текста, после ответа обновляется только база.
// Правки, сделанные во время запроса, и история остаются; ответ для уже закрытого ролика игнорируется.
import type { DraftStore } from './store';

export async function saveDraft<T>(store: DraftStore, put: (html: string, base: string) => Promise<T>, o: { force?: boolean; current: () => boolean }): Promise<T | null> {
  const base = o.force ? store.conflict() : store.base();
  if (base == null || !store.dirty()) return null;
  const html = store.draft();
  const r = await put(html, base);
  if (!o.current()) return null;
  store.markSaved(html);
  return r;
}
