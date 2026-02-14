import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { GraphEntitySummary } from '@/features/entities/types';

interface EntityTableProps {
  rows: GraphEntitySummary[];
  isLoading?: boolean;
  emptyLabel: string;
  onEdit: (entity: GraphEntitySummary) => void;
  onDelete: (entity: GraphEntitySummary) => void;
}

const kindLabel: Record<GraphEntitySummary['templateKind'], string> = {
  agent: 'Agent',
  trigger: 'Trigger',
  tool: 'Tool',
  workspace: 'Workspace',
};

export function EntityTable({ rows, isLoading, emptyLabel, onEdit, onDelete }: EntityTableProps) {
  if (!isLoading && rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Template</TableHead>
          <TableHead>Node ID</TableHead>
          <TableHead>Ports</TableHead>
          <TableHead>Relations</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading && rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
              Loading entities…
            </TableCell>
          </TableRow>
        ) : (
          rows.map((entity) => (
            <TableRow key={entity.id}>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-medium">{entity.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {typeof entity.config.description === 'string'
                      ? entity.config.description
                      : entity.templateName}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-1">
                  <span className="text-sm">{entity.templateTitle}</span>
                  <Badge variant="secondary" className="w-fit text-[11px]">
                    {kindLabel[entity.templateKind]}
                  </Badge>
                </div>
              </TableCell>
              <TableCell>
                <code className="rounded bg-muted px-2 py-1 text-xs">{entity.id}</code>
              </TableCell>
              <TableCell>
                <div className="flex flex-col text-xs text-muted-foreground">
                  <span>Inputs: {entity.ports.inputs.length}</span>
                  <span>Outputs: {entity.ports.outputs.length}</span>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-col text-xs text-muted-foreground">
                  <span>Incoming: {entity.relations.incoming}</span>
                  <span>Outgoing: {entity.relations.outgoing}</span>
                </div>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => onEdit(entity)}>
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onDelete(entity)}>
                    Delete
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
