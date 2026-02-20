import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useNodeStatus } from '@/features/graph/hooks/useNodeStatus';
import type { GraphEntitySummary } from '@/features/entities/types';
import { EntityProvisionStatusCell } from './EntityProvisionStatusCell';

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
          <col style={{ width: '30%' }} />
          <col style={{ width: '22%' }} />
          <col style={{ width: '18%' }} />
          <col style={{ width: '20%' }} />
          <col style={{ width: '10%' }} />
        </colgroup>
        <thead className="sticky top-0 z-10">
          <tr className="bg-white shadow-[0_1px_0_0_var(--agyn-border-subtle)]">
            <th className="text-left px-6 py-3 text-xs font-medium text-[var(--agyn-text-subtle)] bg-white">
              <SortableColumnHeader label="Title" column="title" sort={sort} onSortChange={onSortChange} />
            </th>
            <th className="text-left px-6 py-3 text-xs font-medium text-[var(--agyn-text-subtle)] bg-white">
              <SortableColumnHeader label="Template" column="template" sort={sort} onSortChange={onSortChange} />
            </th>
            <th className="text-left px-6 py-3 text-xs font-medium text-[var(--agyn-text-subtle)] bg-white">Status</th>
            <th className="text-left px-6 py-3 text-xs font-medium text-[var(--agyn-text-subtle)] bg-white">Node ID</th>
            <th className="text-right px-6 py-3 text-xs font-medium text-[var(--agyn-text-subtle)] bg-white">Actions</th>
          </tr>
        </thead>
        <tbody>
          {isLoading && rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-6 py-12 text-center text-sm text-[var(--agyn-text-subtle)]">
                Loading entities…
              </td>
            </tr>
          ) : (
            rows.map((entity) => (
              <EntityTableRow key={entity.id} entity={entity} onEdit={onEdit} onDelete={onDelete} />
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

interface EntityTableRowProps {
  entity: GraphEntitySummary;
  onEdit: (entity: GraphEntitySummary) => void;
  onDelete: (entity: GraphEntitySummary) => void;
}

function EntityTableRow({ entity, onEdit, onDelete }: EntityTableRowProps) {
  const { data: statusData } = useNodeStatus(entity.id);
  const provisionState = statusData?.provisionStatus?.state ?? 'not_ready';
  const provisionDetails = statusData?.provisionStatus?.details;

  return (
    <tr className="border-b border-[var(--agyn-border-subtle)] transition-colors hover:bg-[var(--agyn-bg-light)]/50">
      <td className="h-[60px] px-6">
        <span className="font-medium" data-testid="entity-title">
          {entity.title}
        </span>
      </td>
      <td className="h-[60px] px-6">
        <span className="text-sm" data-testid="entity-template">
          {entity.templateTitle ?? entity.templateName}
        </span>
      </td>
      <td className="h-[60px] px-6">
        <EntityProvisionStatusCell entityId={entity.id} state={provisionState} details={provisionDetails} />
      </td>
      <td className="h-[60px] px-6">
        <code className="rounded bg-[var(--agyn-bg-light)] px-2 py-1 text-xs text-[var(--agyn-dark)]">
          {entity.id}
        </code>
      </td>
      <td className="h-[60px] px-6">
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onEdit(entity)}
            className="rounded-md border border-[var(--agyn-border-subtle)] px-3 py-1.5 text-xs text-[var(--agyn-dark)] transition-colors hover:bg-[var(--agyn-bg-light)]"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => onDelete(entity)}
            className="rounded-md px-3 py-1.5 text-xs text-[var(--agyn-text-subtle)] transition-colors hover:bg-[var(--agyn-bg-light)] hover:text-[var(--agyn-blue)]"
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}
