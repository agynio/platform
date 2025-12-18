import type { ContextItemInput } from './context-items.utils';
import type { RunEventsService } from '../../events/run-events.service';
export type ContextItemAppendEntry = {
  input: ContextItemInput;
  assign?: (id: string) => void;
  countable?: boolean;
};

export async function persistContextItems(params: {
  runEvents: RunEventsService;
  entries: ContextItemAppendEntry[];
}): Promise<string[]> {
  const { runEvents, entries } = params;
  if (!entries.length) return [];

  const inputs = entries.map((entry) => entry.input);
  const ids = await runEvents.createContextItems(inputs);

  ids.forEach((id, index) => {
    const entry = entries[index];
    if (!entry) return;
    if (id && entry.assign) {
      entry.assign(id);
    }
  });

  return ids;
}
