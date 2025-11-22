import { useState } from 'react';
import { ArrowLeft, Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { MainSidebar } from '../MainSidebar';
import { IconButton } from '../IconButton';
import { Input } from '../Input';
import * as Tooltip from '@radix-ui/react-tooltip';

export interface Variable {
  id: string;
  key: string;
  graphValue: string;
  localValue: string;
}

interface VariablesScreenProps {
  variables: Variable[];
  onCreateVariable?: (variable: Omit<Variable, 'id'>) => void;
  onUpdateVariable?: (id: string, variable: Omit<Variable, 'id'>) => void;
  onDeleteVariable?: (id: string) => void;
  onBack?: () => void;
  selectedMenuItem?: string;
  onMenuItemSelect?: (itemId: string) => void;
}

const ITEMS_PER_PAGE = 20;

export default function VariablesScreen({
  variables,
  onCreateVariable,
  onUpdateVariable,
  onDeleteVariable,
  onBack,
  selectedMenuItem,
  onMenuItemSelect,
}: VariablesScreenProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editForm, setEditForm] = useState({ key: '', graphValue: '', localValue: '' });

  // Pagination
  const totalPages = Math.ceil(variables.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedVariables = variables.slice(startIndex, endIndex);

  const handleStartCreate = () => {
    setIsCreating(true);
    setEditForm({ key: '', graphValue: '', localValue: '' });
  };

  const handleStartEdit = (variable: Variable) => {
    setEditingId(variable.id);
    setEditForm({ key: variable.key, graphValue: variable.graphValue, localValue: variable.localValue });
  };

  const handleSaveCreate = () => {
    if (editForm.key.trim()) {
      onCreateVariable?.(editForm);
      setIsCreating(false);
      setEditForm({ key: '', graphValue: '', localValue: '' });
    }
  };

  const handleSaveEdit = () => {
    if (editingId && editForm.key.trim()) {
      onUpdateVariable?.(editingId, editForm);
      setEditingId(null);
      setEditForm({ key: '', graphValue: '', localValue: '' });
    }
  };

  const handleCancel = () => {
    setIsCreating(false);
    setEditingId(null);
    setEditForm({ key: '', graphValue: '', localValue: '' });
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this variable?')) {
      onDeleteVariable?.(id);
    }
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Showcase Navigation - NOT PART OF FINAL SCREEN */}
      {onBack && (
        <div className="h-[40px] bg-[var(--agyn-dark)] border-b border-[var(--agyn-border-subtle)] flex items-center px-4 gap-3">
          <IconButton icon={<ArrowLeft />} onClick={onBack} variant="ghost" size="sm" />
          <span className="text-sm text-white">Variables</span>
        </div>
      )}

      {/* Main Screen Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left MainSidebar */}
        <MainSidebar selectedMenuItem={selectedMenuItem} onMenuItemSelect={onMenuItemSelect} />

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          {/* Header */}
          <div className="border-b border-[var(--agyn-border-subtle)] px-6 py-4 bg-white">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-semibold text-[var(--agyn-dark)]">Variables</h1>
                <p className="text-sm text-[var(--agyn-text-subtle)] mt-1">Manage graph and local variables</p>
              </div>
              <button
                onClick={handleStartCreate}
                disabled={isCreating}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--agyn-blue)] text-white rounded-md hover:bg-[var(--agyn-blue)]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
              >
                <Plus className="w-4 h-4" />
                Add Variable
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto">
            <table className="w-full border-collapse table-fixed">
              <colgroup>
                <col style={{ width: '25%' }} />
                <col style={{ width: '30%' }} />
                <col style={{ width: '30%' }} />
                <col style={{ width: '15%' }} />
              </colgroup>
              <thead className="sticky top-0 z-10">
                <tr className="bg-white shadow-[0_1px_0_0_var(--agyn-border-subtle)]">
                  <th className="text-left px-6 py-3 text-xs font-medium text-[var(--agyn-text-subtle)] bg-white">
                    Key
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-[var(--agyn-text-subtle)] bg-white">
                    Graph Value
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-[var(--agyn-text-subtle)] bg-white">
                    Local Value
                  </th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-[var(--agyn-text-subtle)] bg-white">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* Create Row */}
                {isCreating && (
                  <tr className="bg-[var(--agyn-blue)]/5 border-b border-[var(--agyn-border-subtle)]">
                    <td className="px-6 py-3" style={{ minHeight: '60px' }}>
                      <Input
                        value={editForm.key}
                        onChange={(e) => setEditForm({ ...editForm, key: e.target.value })}
                        placeholder="Enter key"
                        size="sm"
                        autoFocus
                      />
                    </td>
                    <td className="px-6 py-3" style={{ minHeight: '60px' }}>
                      <Input
                        value={editForm.graphValue}
                        onChange={(e) => setEditForm({ ...editForm, graphValue: e.target.value })}
                        placeholder="Enter graph value"
                        size="sm"
                      />
                    </td>
                    <td className="px-6 py-3" style={{ minHeight: '60px' }}>
                      <Input
                        value={editForm.localValue}
                        onChange={(e) => setEditForm({ ...editForm, localValue: e.target.value })}
                        placeholder="Enter local value"
                        size="sm"
                      />
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Tooltip.Provider delayDuration={300}>
                          <Tooltip.Root>
                            <Tooltip.Trigger asChild>
                              <button
                                onClick={handleSaveCreate}
                                className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--agyn-status-success)] hover:bg-[var(--agyn-status-success)]/10 transition-colors"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                            </Tooltip.Trigger>
                            <Tooltip.Portal>
                              <Tooltip.Content
                                className="bg-[var(--agyn-dark)] text-white text-xs px-2 py-1 rounded-md z-50"
                                sideOffset={5}
                              >
                                Save
                                <Tooltip.Arrow className="fill-[var(--agyn-dark)]" />
                              </Tooltip.Content>
                            </Tooltip.Portal>
                          </Tooltip.Root>
                        </Tooltip.Provider>
                        <Tooltip.Provider delayDuration={300}>
                          <Tooltip.Root>
                            <Tooltip.Trigger asChild>
                              <button
                                onClick={handleCancel}
                                className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-bg-light)] transition-colors"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </Tooltip.Trigger>
                            <Tooltip.Portal>
                              <Tooltip.Content
                                className="bg-[var(--agyn-dark)] text-white text-xs px-2 py-1 rounded-md z-50"
                                sideOffset={5}
                              >
                                Cancel
                                <Tooltip.Arrow className="fill-[var(--agyn-dark)]" />
                              </Tooltip.Content>
                            </Tooltip.Portal>
                          </Tooltip.Root>
                        </Tooltip.Provider>
                      </div>
                    </td>
                  </tr>
                )}

                {/* Data Rows */}
                {paginatedVariables.length === 0 && !isCreating ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-sm text-[var(--agyn-text-subtle)]">
                      No variables found. Click "Add Variable" to create one.
                    </td>
                  </tr>
                ) : (
                  paginatedVariables.map((variable) => {
                    const isEditing = editingId === variable.id;

                    if (isEditing) {
                      return (
                        <tr
                          key={variable.id}
                          className="bg-[var(--agyn-blue)]/5 border-b border-[var(--agyn-border-subtle)]"
                        >
                          <td className="px-6 py-3" style={{ minHeight: '60px' }}>
                            <Input
                              value={editForm.key}
                              onChange={(e) => setEditForm({ ...editForm, key: e.target.value })}
                              size="sm"
                              autoFocus
                            />
                          </td>
                          <td className="px-6 py-3" style={{ minHeight: '60px' }}>
                            <Input
                              value={editForm.graphValue}
                              onChange={(e) => setEditForm({ ...editForm, graphValue: e.target.value })}
                              size="sm"
                            />
                          </td>
                          <td className="px-6 py-3" style={{ minHeight: '60px' }}>
                            <Input
                              value={editForm.localValue}
                              onChange={(e) => setEditForm({ ...editForm, localValue: e.target.value })}
                              size="sm"
                            />
                          </td>
                          <td className="px-6 py-3" style={{ minHeight: '60px' }}>
                            <div className="flex items-center justify-end gap-1">
                              <Tooltip.Provider delayDuration={300}>
                                <Tooltip.Root>
                                  <Tooltip.Trigger asChild>
                                    <button
                                      onClick={handleSaveEdit}
                                      className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--agyn-status-success)] hover:bg-[var(--agyn-status-success)]/10 transition-colors"
                                    >
                                      <Check className="w-4 h-4" />
                                    </button>
                                  </Tooltip.Trigger>
                                  <Tooltip.Portal>
                                    <Tooltip.Content
                                      className="bg-[var(--agyn-dark)] text-white text-xs px-2 py-1 rounded-md z-50"
                                      sideOffset={5}
                                    >
                                      Save
                                      <Tooltip.Arrow className="fill-[var(--agyn-dark)]" />
                                    </Tooltip.Content>
                                  </Tooltip.Portal>
                                </Tooltip.Root>
                              </Tooltip.Provider>
                              <Tooltip.Provider delayDuration={300}>
                                <Tooltip.Root>
                                  <Tooltip.Trigger asChild>
                                    <button
                                      onClick={handleCancel}
                                      className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-bg-light)] transition-colors"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </Tooltip.Trigger>
                                  <Tooltip.Portal>
                                    <Tooltip.Content
                                      className="bg-[var(--agyn-dark)] text-white text-xs px-2 py-1 rounded-md z-50"
                                      sideOffset={5}
                                    >
                                      Cancel
                                      <Tooltip.Arrow className="fill-[var(--agyn-dark)]" />
                                    </Tooltip.Content>
                                  </Tooltip.Portal>
                                </Tooltip.Root>
                              </Tooltip.Provider>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr
                        key={variable.id}
                        className="border-b border-[var(--agyn-border-subtle)] hover:bg-[var(--agyn-bg-light)]/50 transition-colors"
                      >
                        <td className="px-6 h-[60px]">
                          <span className="text-sm text-[var(--agyn-dark)] font-medium font-mono">{variable.key}</span>
                        </td>
                        <td className="px-6 h-[60px]">
                          <span className="text-sm text-[var(--agyn-dark)]">{variable.graphValue || '-'}</span>
                        </td>
                        <td className="px-6 h-[60px]">
                          <span className="text-sm text-[var(--agyn-dark)]">{variable.localValue || '-'}</span>
                        </td>
                        <td className="px-6 h-[60px]">
                          <div className="flex items-center justify-end gap-1">
                            <Tooltip.Provider delayDuration={300}>
                              <Tooltip.Root>
                                <Tooltip.Trigger asChild>
                                  <button
                                    onClick={() => handleStartEdit(variable)}
                                    disabled={isCreating || editingId !== null}
                                    className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-bg-light)] hover:text-[var(--agyn-blue)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                </Tooltip.Trigger>
                                <Tooltip.Portal>
                                  <Tooltip.Content
                                    className="bg-[var(--agyn-dark)] text-white text-xs px-2 py-1 rounded-md z-50"
                                    sideOffset={5}
                                  >
                                    Edit
                                    <Tooltip.Arrow className="fill-[var(--agyn-dark)]" />
                                  </Tooltip.Content>
                                </Tooltip.Portal>
                              </Tooltip.Root>
                            </Tooltip.Provider>
                            <Tooltip.Provider delayDuration={300}>
                              <Tooltip.Root>
                                <Tooltip.Trigger asChild>
                                  <button
                                    onClick={() => handleDelete(variable.id)}
                                    disabled={isCreating || editingId !== null}
                                    className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-status-failed)]/10 hover:text-[var(--agyn-status-failed)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </Tooltip.Trigger>
                                <Tooltip.Portal>
                                  <Tooltip.Content
                                    className="bg-[var(--agyn-dark)] text-white text-xs px-2 py-1 rounded-md z-50"
                                    sideOffset={5}
                                  >
                                    Delete
                                    <Tooltip.Arrow className="fill-[var(--agyn-dark)]" />
                                  </Tooltip.Content>
                                </Tooltip.Portal>
                              </Tooltip.Root>
                            </Tooltip.Provider>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="border-t border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)] px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-[var(--agyn-text-subtle)]">
                  Showing {startIndex + 1} to {Math.min(endIndex, variables.length)} of {variables.length} variable
                  {variables.length !== 1 ? 's' : ''}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 text-sm text-[var(--agyn-text-subtle)] hover:text-[var(--agyn-dark)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`w-8 h-8 rounded-md text-sm transition-all ${
                          currentPage === page
                            ? 'bg-[var(--agyn-blue)]/10 text-[var(--agyn-blue)] font-medium'
                            : 'text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-bg-light)]'
                        }`}
                      >
                        {page}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 text-sm text-[var(--agyn-text-subtle)] hover:text-[var(--agyn-dark)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
