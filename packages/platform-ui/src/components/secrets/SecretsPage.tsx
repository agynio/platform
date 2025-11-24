import SecretsScreen, { type Secret as SecretsScreenSecret } from '@/components/screens/SecretsScreen';

interface SecretsPageProps {
  secrets: SecretsScreenSecret[];
  isLoading?: boolean;
  warningMessage?: string | null;
  onCreateSecret?: (secret: Omit<SecretsScreenSecret, 'id'>) => void;
  onUpdateSecret?: (id: string, secret: Omit<SecretsScreenSecret, 'id'>) => void;
  onDeleteSecret?: (id: string) => void;
}

export function SecretsPage({
  secrets,
  isLoading = false,
  warningMessage = null,
  onCreateSecret,
  onUpdateSecret,
  onDeleteSecret,
}: SecretsPageProps) {
  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden bg-white">
      <SecretsScreen
        secrets={secrets}
        onCreateSecret={onCreateSecret}
        onUpdateSecret={onUpdateSecret}
        onDeleteSecret={onDeleteSecret}
      />

      {warningMessage && (
        <div className="pointer-events-none absolute left-0 right-0 top-24 z-20 flex justify-center px-6">
          <div className="pointer-events-auto w-full max-w-4xl rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
            {warningMessage}
          </div>
        </div>
      )}

      {isLoading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-sm" role="status">
          <span className="text-sm text-[var(--agyn-text-subtle)]">Loading secrets…</span>
        </div>
      )}
    </div>
  );
}
