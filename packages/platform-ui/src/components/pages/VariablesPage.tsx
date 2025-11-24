import VariablesScreen, { type Variable as ScreenVariable } from '@/components/screens/VariablesScreen';

export interface VariablesPageProps {
  variables: ScreenVariable[];
  isLoading?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
  onCreateVariable?: (variable: Omit<ScreenVariable, 'id'>) => void | Promise<void>;
  onUpdateVariable?: (id: string, variable: Omit<ScreenVariable, 'id'>) => void | Promise<void>;
  onDeleteVariable?: (id: string) => void | Promise<void>;
}

export function VariablesPage({
  variables,
  isLoading = false,
  errorMessage,
  onRetry,
  onCreateVariable,
  onUpdateVariable,
  onDeleteVariable,
}: VariablesPageProps) {
  const showError = !isLoading && Boolean(errorMessage);
  const showOverlay = isLoading || showError;

  return (
    <div className="relative h-full min-h-0 bg-[var(--agyn-bg-light)]">
      <VariablesScreen variables={variables} onCreateVariable={onCreateVariable} onUpdateVariable={onUpdateVariable} onDeleteVariable={onDeleteVariable} />

      {showOverlay && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
          <div className="pointer-events-auto rounded-lg border border-[var(--agyn-border-subtle)] bg-white/90 px-6 py-4 text-center shadow-sm">
            {isLoading && <p className="text-sm text-[var(--agyn-text-subtle)]">Loading variables…</p>}
            {showError && (
              <div className="flex flex-col items-center gap-3">
                <p className="text-sm text-[var(--agyn-text-subtle)]">{errorMessage}</p>
                {onRetry && (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="rounded-md border border-[var(--agyn-border-strong)] px-3 py-1.5 text-sm text-[var(--agyn-dark)] shadow-sm hover:bg-[var(--agyn-bg-light)]"
                  >
                    Retry
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
