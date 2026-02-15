import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { GraphEntitySummary } from '@/features/entities/types';

export type EntityTableSortKey = 'title' | 'template';
export type EntityTableSortDirection = 'asc' | 'desc';

export interface EntityTableSortState {
  key: EntityTableSortKey;
  direction: EntityTableSortDirection;
}

interface EntityTableProps {
  rows: GraphEntitySummary[];
  isLoading?: boolean;
  emptyLabel: string;
  onEdit: (entity: GraphEntitySummary) => void;
  onDelete: (entity: GraphEntitySummary) => void;
  sort: EntityTableSortState;
  onSortChange: (key: EntityTableSortKey) => void;
}

const kindLabel: Record<GraphEntitySummary['templateKind'], string> = {
  agent: 'Agent',
  trigger: 'Trigger',
  tool: 'Tool',
  workspace: 'Workspace',
};

export function EntityTable({ rows, isLoading, emptyLabel, onEdit, onDelete, sort, onSortChange }: EntityTableProps) {
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
          <TableHead>
            <SortableColumnHeader label="Title" column="title" sort={sort} onSortChange={onSortChange} />
          </TableHead>
          <TableHead>
            <SortableColumnHeader label="Template" column="template" sort={sort} onSortChange={onSortChange} />
          </TableHead>
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
                  <span className="font-medium" data-testid="entity-title">
                    {entity.title}
                  </span>
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

interface SortableColumnHeaderProps {
  label: string;
  column: EntityTableSortKey;
  sort: EntityTableSortState;
  onSortChange: (key: EntityTableSortKey) => void;
}

function SortableColumnHeader({ label, column, sort, onSortChange }: SortableColumnHeaderProps) {
  const isActive = sort.key === column;
  const Icon = !isActive ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => onSortChange(column)}
      aria-label={`Sort by ${label}`}
      className="h-auto justify-start gap-1 px-0 text-muted-foreground hover:text-foreground"
    >
      <span>{label}</span>
      <Icon className="h-3.5 w-3.5" aria-hidden />
    </Button>
  );
}
