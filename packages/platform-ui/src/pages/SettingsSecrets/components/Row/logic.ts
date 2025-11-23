import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/api/modules/graph';
import type { SecretEntry } from '@/api/modules/graph';
import { notifyError, notifySuccess } from '@/lib/notify';

interface UseRowLogicResult {
  isEditing: boolean;
  isReveal: boolean;
  isReading: boolean;
  value: string;
  canSave: boolean;
  entry: SecretEntry;
  startEdit: () => void;
  cancelEdit: () => void;
  toggleReveal: () => Promise<void>;
  onValueChange: (next: string) => void;
  save: () => void;
  copy: () => Promise<void>;
  isSaving: boolean;
}

export function useRowLogic(entry: SecretEntry): UseRowLogicResult {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [isReveal, setIsReveal] = useState(false);
  const [value, setValue] = useState('');
  const [isReading, setIsReading] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      setValue('');
      setIsReveal(false);
      setIsReading(false);
    }
  }, [isEditing]);

  const readCurrentValue = async () => {
    setIsReading(true);
    try {
      const res = await api.graph.readVaultKey(entry.mount, entry.path, entry.key);
      if (res && typeof res.value === 'string') {
        setValue(res.value);
      } else {
        setValue('');
        notifyError('Failed to load value');
      }
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        setValue('');
        notifyError('No value available');
      } else {
        notifyError('Failed to load value');
      }
    } finally {
      setIsReading(false);
    }
  };

  const toggleReveal = async () => {
    if (!isReveal) {
      if (!value) {
        await readCurrentValue();
      }
      setIsReveal(true);
    } else {
      setIsReveal(false);
    }
  };

  const copy = async () => {
    if (!isReveal || !value) return;
    try {
      await navigator.clipboard.writeText(value);
      notifySuccess('Copied');
    } catch {
      notifyError('Copy failed');
    }
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const trimmed = value.trim();
      if (!trimmed) throw new Error('Value required');
      const res = await api.graph.writeVaultKey(entry.mount, {
        path: entry.path,
        key: entry.key,
        value: trimmed,
      });
      return res;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['vault', 'keys', entry.mount, entry.path] });
      await queryClient.invalidateQueries({ queryKey: ['vault', 'discover'] });
      notifySuccess('Secret saved');
      setIsEditing(false);
    },
    onError: (error: unknown) => {
      const message = (error as Error)?.message || 'Write failed';
      notifyError(String(message));
    },
  });

  const canSave = useMemo(() => value.trim().length > 0 && !mutation.isPending, [value, mutation.isPending]);

  const startEdit = () => {
    setIsEditing(true);
  };

  const cancelEdit = () => {
    if (mutation.isPending) return;
    setIsEditing(false);
  };

  const save = () => {
    if (!value.trim() || mutation.isPending) return;
    mutation.mutate();
  };

  return {
    entry,
    isEditing,
    isReveal,
    isReading,
    value,
    canSave,
    startEdit,
    cancelEdit,
    toggleReveal,
    onValueChange: setValue,
    save,
    copy,
    isSaving: mutation.isPending,
  };
}
