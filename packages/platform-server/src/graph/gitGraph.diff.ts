// Diff helpers extracted to avoid parser sensitivity; explicit blocks and semicolons.

export type Edge = { id: string } & Record<string, unknown>;

export function diffNodes(
  a: Map<string, string>,
  b: Map<string, string>,
): { updates: Map<string, string>; deletes: string[] } {
  const updates = new Map<string, string>();
  const deletes: string[] = [];

  for (const [id, valA] of a.entries()) {
    const valB = b.get(id);
    if (valB !== valA) {
      updates.set(id, valA);
    }
  }

  for (const id of b.keys()) {
    if (!a.has(id)) {
      deletes.push(id);
    }
  }

  return { updates, deletes };
}

export function diffEdges(
  a: Map<string, Edge>,
  b: Map<string, Edge>,
): { updates: Map<string, Edge>; deletes: string[] } {
  const updates = new Map<string, Edge>();
  const deletes: string[] = [];

  for (const [id, edgeA] of a.entries()) {
    const edgeB = b.get(id);
    const aStr = JSON.stringify(edgeA);
    const bStr = edgeB ? JSON.stringify(edgeB) : undefined;
    if (aStr !== bStr) {
      updates.set(id, edgeA);
    }
  }

  for (const id of b.keys()) {
    if (!a.has(id)) {
      deletes.push(id);
    }
  }

  return { updates, deletes };
}

