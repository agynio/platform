import { PersistedGraphUpsertRequest, TemplateNodeSchema } from '../graph/types';
import { variableKeyRegex } from '../variables/variables.types';

export function validatePersistedGraph(req: PersistedGraphUpsertRequest, schema: TemplateNodeSchema[]): void {
  const templateSet = new Set(schema.map((s) => s.name));
  const schemaMap = new Map(schema.map((s) => [s.name, s] as const));
  const nodeIds = new Set<string>();
  for (const n of req.nodes) {
    if (!n.id) throw new Error('Node missing id');
    if (nodeIds.has(n.id)) throw new Error(`Duplicate node id ${n.id}`);
    nodeIds.add(n.id);
    if (!templateSet.has(n.template)) throw new Error(`Unknown template ${n.template}`);
  }
  for (const e of req.edges) {
    if (!nodeIds.has(e.source)) throw new Error(`Edge source missing node ${e.source}`);
    if (!nodeIds.has(e.target)) throw new Error(`Edge target missing node ${e.target}`);
    const sourceNode = req.nodes.find((n) => n.id === e.source)!;
    const targetNode = req.nodes.find((n) => n.id === e.target)!;
    const sourceSchema = schemaMap.get(sourceNode.template)!;
    const targetSchema = schemaMap.get(targetNode.template)!;
    if (!sourceSchema.sourcePorts.includes(e.sourceHandle)) {
      throw new Error(`Invalid source handle ${e.sourceHandle} on template ${sourceNode.template}`);
    }
    if (!targetSchema.targetPorts.includes(e.targetHandle)) {
      throw new Error(`Invalid target handle ${e.targetHandle} on template ${targetNode.template}`);
    }
  }

  // Variables validation: optional; enforce unique keys and source invariants
  if (req.variables?.items) {
    const seen = new Set<string>();
    for (const v of req.variables.items) {
      if (seen.has(v.key)) throw new Error(`Duplicate variable key ${v.key}`);
      seen.add(v.key);
      if (!variableKeyRegex.test(v.key)) throw new Error(`Invalid variable key ${v.key}`);
      // Invariants per source
      if (v.source === 'graph') {
        // value/vaultRef can be empty strings; do not require presence; normalize later in service
      } else if (v.source === 'vault') {
        // vaultRef may be empty or absent; service will normalize
      } else if (v.source === 'local') {
        // local has neither stored in graph
      }
    }
  }
}
