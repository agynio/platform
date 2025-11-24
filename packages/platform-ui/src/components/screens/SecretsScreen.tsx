import { useState } from 'react';
import { ArrowLeft, Plus, Pencil, Trash2, Check, X, Eye, EyeOff } from 'lucide-react';
import { IconButton } from '../IconButton';
import { Input } from '../Input';
import { Badge } from '../Badge';
import * as Tooltip from '@radix-ui/react-tooltip';

export interface Secret {
  id: string;
  key: string;
  value: string;
  status: 'used' | 'missing';
}

interface SecretsScreenProps {
  secrets: Secret[];
  onCreateSecret?: (secret: Omit<Secret, 'id'>) => void;
  onUpdateSecret?: (id: string, secret: Omit<Secret, 'id'>) => void;
  onDeleteSecret?: (id: string) => void;
  onBack?: () => void;
}

const ITEMS_PER_PAGE = 20;

export default function SecretsScreen({
  secrets,
  onCreateSecret,
  onUpdateSecret,
  onDeleteSecret,
  onBack,
}: SecretsScreenProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<'all' | 'used' | 'missing'>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editForm, setEditForm] = useState<{ key: string; value: string; status: 'used' | 'missing' }>({ key: '', value: '', status: 'used' });
  const [unmaskedSecrets, setUnmaskedSecrets] = useState<Set<string>>(new Set());

  // Filter secrets
  const filteredSecrets = secrets.filter((secret) => {
    if (statusFilter === 'all') return true;
    return secret.status === statusFilter;
  });

  // Pagination
  const totalPages = Math.ceil(filteredSecrets.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedSecrets = filteredSecrets.slice(startIndex, endIndex);

  const handleStartCreate = () => {
    setIsCreating(true);
    setEditForm({ key: '', value: '', status: 'used' });
  };

  const handleStartEdit = (secret: Secret) => {
    setEditingId(secret.id);
    setEditForm({ key: secret.key, value: secret.value, status: secret.status });
  };

  const handleSaveCreate = () => {
    if (editForm.key.trim() && editForm.value.trim()) {
      onCreateSecret?.(editForm);
      setIsCreating(false);
      setEditForm({ key: '', value: '', status: 'used' });
    }
  };

  const handleSaveEdit = () => {
    if (editingId && editForm.key.trim() && editForm.value.trim()) {
      onUpdateSecret?.(editingId, editForm);
      setEditingId(null);
      setEditForm({ key: '', value: '', status: 'used' });
    }
  };

  const handleCancel = () => {
    setIsCreating(false);
    setEditingId(null);
    setEditForm({ key: '', value: '', status: 'used' });
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this secret?')) {
      onDeleteSecret?.(id);
    }
  };

  const handleCreateMissing = (missingSecret: Secret) => {
    setEditingId(missingSecret.id);
    setEditForm({ key: missingSecret.key, value: '', status: 'used' });
  };

  const toggleUnmask = (id: string) => {
    const newUnmasked = new Set(unmaskedSecrets);
    if (newUnmasked.has(id)) {
      newUnmasked.delete(id);
    } else {
      newUnmasked.add(id);
    }
    setUnmaskedSecrets(newUnmasked);
  };

  const maskValue = (value: string) => '•'.repeat(Math.min(value.length, 20));

  const usedCount = secrets.filter((s) => s.status === 'used').length;
  const missingCount = secrets.filter((s) => s.status === 'missing').length;

  return (
    <div className="h-screen flex flex-col">
      {/* Showcase Navigation - NOT PART OF FINAL SCREEN */}
      {onBack && (
        <div className="h-[40px] bg-[var(--agyn-dark)] border-b border-[var(--agyn-border-subtle)] flex items-center px-4 gap-3">
          <IconButton icon={<ArrowLeft />} onClick={onBack} variant="ghost" size="sm" />
          <span className="text-sm text-white">Secrets</span>
        </div>
      )}

      {/* Main Screen Content (content only, layout provides sidebar) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          {/* Header */}
          <div className="border-b border-[var(--agyn-border-subtle)] px-6 py-4 bg-white">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-semibold text-[var(--agyn-dark)]">Secrets</h1>
                <p className="text-sm text-[var(--agyn-text-subtle)] mt-1">
                  Manage secure credentials and API keys
                </p>
              </div>
              <button
                onClick={handleStartCreate}
                disabled={isCreating}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--agyn-blue)] text-white rounded-md hover:bg-[var(--agyn-blue)]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
              >
                <Plus className="w-4 h-4" />
                Add Secret
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="border-b border-[var(--agyn-border-subtle)] px-6 py-3 bg-white">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 text-xs rounded-md transition-all ${
                  statusFilter === 'all'
                    ? 'bg-[var(--agyn-blue)]/10 text-[var(--agyn-blue)]'
                    : 'text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-bg-light)]'
                }`}
              >
                All ({secrets.length})
              </button>
              <button
                onClick={() => setStatusFilter('used')}
                className={`px-3 py-1.5 text-xs rounded-md transition-all ${
                  statusFilter === 'used'
                    ? 'bg-[var(--agyn-blue)]/10 text-[var(--agyn-blue)]'
                    : 'text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-bg-light)]'
                }`}
              >
                Used ({usedCount})
              </button>
              <button
                onClick={() => setStatusFilter('missing')}
                className={`px-3 py-1.5 text-xs rounded-md transition-all ${
                  statusFilter === 'missing'
                    ? 'bg-[var(--agyn-blue)]/10 text-[var(--agyn-blue)]'
                    : 'text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-bg-light)]'
                }`}
              >
                Missing ({missingCount})
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto">
            <table className="w-full border-collapse table-fixed">
              <colgroup>
                <col style={{ width: '30%' }} />
                <col style={{ width: '50%' }} />
                <col style={{ width: '20%' }} />
              </colgroup>
              <thead className="sticky top-0 z-10">
                <tr className="bg-white shadow-[0_1px_0_0_var(--agyn-border-subtle)]">
                  <th className="text-left px-6 py-3 text-xs font-medium text-[var(--agyn-text-subtle)] bg-white">
                    Key
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-[var(--agyn-text-subtle)] bg-white">
                    Value
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
                    <td className="px-6 h-[60px]">
                      <Input
                        value={editForm.key}
                        onChange={(e) => setEditForm({ ...editForm, key: e.target.value })}
                        placeholder="Enter key"
                        size="sm"
                        autoFocus
                      />
                    </td>
                    <td className="px-6 h-[60px]">
                      <Input
                        value={editForm.value}
                        onChange={(e) => setEditForm({ ...editForm, value: e.target.value })}
                        placeholder="Enter value"
                        size="sm"
                        type="password"
                      />
                    </td>
                    <td className="px-6 h-[60px]">
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
                {paginatedSecrets.length === 0 && !isCreating ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-12 text-center text-sm text-[var(--agyn-text-subtle)]">
                      No secrets found. Click "Add Secret" to create one.
                    </td>
                  </tr>
                ) : (
                  paginatedSecrets.map((secret) => {
                    const isEditing = editingId === secret.id;
                    const isUnmasked = unmaskedSecrets.has(secret.id);
                    const isMissing = secret.status === 'missing';

                    if (isEditing) {
                      return (
                        <tr key={secret.id} className="bg-[var(--agyn-blue)]/5 border-b border-[var(--agyn-border-subtle)]">
                          <td className="px-6 h-[60px]">
                            <Input
                              value={editForm.key}
                              onChange={(e) => setEditForm({ ...editForm, key: e.target.value })}
                              size="sm"
                              autoFocus
                            />
                          </td>
                          <td className="px-6 h-[60px]">
                            <Input
                              value={editForm.value}
                              onChange={(e) => setEditForm({ ...editForm, value: e.target.value })}
                              size="sm"
                              type="text"
                            />
                          </td>
                          <td className="px-6 h-[60px]">
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
                      <tr key={secret.id} className="border-b border-[var(--agyn-border-subtle)] hover:bg-[var(--agyn-bg-light)]/50 transition-colors">
                        <td className="px-6 h-[60px]">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-[var(--agyn-dark)] font-medium font-mono">{secret.key}</span>
                            {isMissing && <Badge variant="warning" size="sm">Missing</Badge>}
                          </div>
                        </td>
                        <td className="px-6 h-[60px]">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-[var(--agyn-dark)] font-mono">
                              {isMissing ? '-' : (isUnmasked ? secret.value : maskValue(secret.value))}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 h-[60px]">
                          <div className="flex items-center justify-end gap-1">
                            {isMissing ? (
                              <button
                                onClick={() => handleCreateMissing(secret)}
                                className="px-3 py-1.5 text-xs bg-[var(--agyn-blue)] text-white rounded-md hover:bg-[var(--agyn-blue)]/90 transition-colors"
                              >
                                Create
                              </button>
                            ) : (
                              <>
                                <Tooltip.Provider delayDuration={300}>
                                  <Tooltip.Root>
                                    <Tooltip.Trigger asChild>
                                      <button
                                        onClick={() => toggleUnmask(secret.id)}
                                        className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--agyn-text-subtle)] hover:bg-[var(--agyn-bg-light)] hover:text-[var(--agyn-blue)] transition-colors"
                                      >
                                        {isUnmasked ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                      </button>
                                    </Tooltip.Trigger>
                                    <Tooltip.Portal>
                                      <Tooltip.Content
                                        className="bg-[var(--agyn-dark)] text-white text-xs px-2 py-1 rounded-md z-50"
                                        sideOffset={5}
                                      >
                                        {isUnmasked ? 'Mask' : 'Unmask'}
                                        <Tooltip.Arrow className="fill-[var(--agyn-dark)]" />
                                      </Tooltip.Content>
                                    </Tooltip.Portal>
                                  </Tooltip.Root>
                                </Tooltip.Provider>
                                <Tooltip.Provider delayDuration={300}>
                                  <Tooltip.Root>
                                    <Tooltip.Trigger asChild>
                                      <button
                                        onClick={() => handleStartEdit(secret)}
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
                                        onClick={() => handleDelete(secret.id)}
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
                              </>
                            )}
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
                  Showing {startIndex + 1} to {Math.min(endIndex, filteredSecrets.length)} of{' '}
                  {filteredSecrets.length} secret{filteredSecrets.length !== 1 ? 's' : ''}
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
