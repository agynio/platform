import { useMemo } from 'react';
import { SegmentedControl } from '@/components/SegmentedControl';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { useLogic } from './logic';
import type { SecretFilter } from './logic';
import { Row } from './components/Row';

export function SettingsSecrets() {
  const { isLoading, banner, filter, onFilterChange, entries, counts, hasData } = useLogic();

  const filterItems = useMemo(
    () => [
      { value: 'used', label: `Used (${counts.used})` },
      { value: 'missing', label: `Missing (${counts.missing})` },
      { value: 'all', label: `All (${counts.all})` },
    ],
    [counts],
  );

  return (
    <div className="flex h-full flex-col bg-[var(--agyn-bg-base)]">
      <div className="border-b border-[var(--agyn-border-subtle)] bg-white px-6 py-4">
        <h1 className="text-xl font-semibold text-[var(--agyn-dark)]">Secrets</h1>
        <p className="mt-1 text-sm text-[var(--agyn-text-subtle)]">Manage secure credentials and API keys.</p>
      </div>

      <div className="border-b border-[var(--agyn-border-subtle)] bg-white px-6 py-3">
        <SegmentedControl
          items={filterItems}
          value={filter}
          onChange={(value) => onFilterChange(value as SecretFilter)}
          size="sm"
        />
      </div>

      {banner && (
        <div className="border-b border-[var(--agyn-border-subtle)] bg-[var(--agyn-status-pending-bg)] px-6 py-3 text-sm text-[var(--agyn-status-pending)]">
          {banner.message}
        </div>
      )}

      <div className="flex-1 overflow-auto bg-white">
        <Table className="table-fixed border-collapse">
          <colgroup>
            <col style={{ width: '30%' }} />
            <col style={{ width: '50%' }} />
            <col style={{ width: '20%' }} />
          </colgroup>
          <TableHeader className="sticky top-0 z-10">
            <TableRow className="bg-white shadow-[0_1px_0_0_var(--agyn-border-subtle)]">
              <TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-[var(--agyn-text-subtle)]">Key</TableHead>
              <TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-[var(--agyn-text-subtle)]">Value</TableHead>
              <TableHead className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wide text-[var(--agyn-text-subtle)]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={3} className="px-6 py-8 text-center text-sm text-[var(--agyn-text-subtle)]">
                  Loading secrets…
                </TableCell>
              </TableRow>
            ) : hasData ? (
              entries.map((entry) => <Row key={`${entry.mount}::${entry.path}::${entry.key}`} entry={entry} />)
            ) : (
              <TableRow>
                <TableCell colSpan={3} className="px-6 py-8 text-center text-sm text-[var(--agyn-text-subtle)]">
                  No secrets to display.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
