import { PersistedGraphUpsertRequest, TemplateNodeSchema } from '../graph/types';

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
}

