import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Badge } from '@/components/Badge';
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
    <div className="flex-1 overflow-auto">
      <table className="w-full border-collapse table-fixed">
        <colgroup>
          <col style={{ width: '26%' }} />
          <col style={{ width: '20%' }} />
          <col style={{ width: '18%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '12%' }} />
        </colgroup>
        <thead className="sticky top-0 z-10">
          <tr className="bg-white shadow-[0_1px_0_0_var(--agyn-border-subtle)]">
            <th className="text-left px-6 py-3 text-xs font-medium text-[var(--agyn-text-subtle)] bg-white">
              <SortableColumnHeader label="Title" column="title" sort={sort} onSortChange={onSortChange} />
            </th>
            <th className="text-left px-6 py-3 text-xs font-medium text-[var(--agyn-text-subtle)] bg-white">
              <SortableColumnHeader label="Template" column="template" sort={sort} onSortChange={onSortChange} />
            </th>
            <th className="text-left px-6 py-3 text-xs font-medium text-[var(--agyn-text-subtle)] bg-white">Node ID</th>
            <th className="text-left px-6 py-3 text-xs font-medium text-[var(--agyn-text-subtle)] bg-white">Ports</th>
            <th className="text-left px-6 py-3 text-xs font-medium text-[var(--agyn-text-subtle)] bg-white">Relations</th>
            <th className="text-right px-6 py-3 text-xs font-medium text-[var(--agyn-text-subtle)] bg-white">Actions</th>
          </tr>
        </thead>
        <tbody>
          {isLoading && rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-6 py-12 text-center text-sm text-[var(--agyn-text-subtle)]">
                Loading entities…
              </td>
            </tr>
          ) : (
            rows.map((entity) => (
              <tr
                key={entity.id}
                className="border-b border-[var(--agyn-border-subtle)] hover:bg-[var(--agyn-bg-light)]/50 transition-colors"
              >
                <td className="px-6 h-[60px]">
                  <div className="flex flex-col">
                    <span className="font-medium" data-testid="entity-title">
                      {entity.title}
                    </span>
                    <span className="text-xs text-[var(--agyn-text-subtle)]">
                      {typeof entity.config.description === 'string'
                        ? entity.config.description
                        : entity.templateName}
                    </span>
                  </div>
                </td>
                <td className="px-6 h-[60px]">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm">{entity.templateTitle}</span>
                    <Badge variant="secondary" className="w-fit text-[11px]">
                      {kindLabel[entity.templateKind]}
                    </Badge>
                  </div>
                </td>
                <td className="px-6 h-[60px]">
                  <code className="rounded bg-[var(--agyn-bg-light)] px-2 py-1 text-xs text-[var(--agyn-dark)]">
                    {entity.id}
                  </code>
                </td>
                <td className="px-6 h-[60px]">
                  <div className="flex flex-col text-xs text-[var(--agyn-text-subtle)]">
                    <span>Inputs: {entity.ports.inputs.length}</span>
                    <span>Outputs: {entity.ports.outputs.length}</span>
                  </div>
                </td>
                <td className="px-6 h-[60px]">
                  <div className="flex flex-col text-xs text-[var(--agyn-text-subtle)]">
                    <span>Incoming: {entity.relations.incoming}</span>
                    <span>Outgoing: {entity.relations.outgoing}</span>
                  </div>
                </td>
                <td className="px-6 h-[60px]">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onEdit(entity)}
                      className="px-3 py-1.5 text-xs rounded-md border border-[var(--agyn-border-subtle)] text-[var(--agyn-dark)] hover:bg-[var(--agyn-bg-light)] transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(entity)}
                      className="px-3 py-1.5 text-xs rounded-md text-[var(--agyn-text-subtle)] hover:text-[var(--agyn-blue)] hover:bg-[var(--agyn-bg-light)] transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
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
    <button
      type="button"
      onClick={() => onSortChange(column)}
      aria-label={`Sort by ${label}`}
      className="inline-flex items-center gap-1 text-[inherit]"
    >
      <span>{label}</span>
      <Icon className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
}
