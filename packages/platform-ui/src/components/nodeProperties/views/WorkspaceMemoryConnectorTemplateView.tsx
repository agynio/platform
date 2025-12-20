import type { NodePropertiesViewProps } from '../viewTypes';
import { isRecord } from '../utils';

type MemoryConnectorTemplateProps = NodePropertiesViewProps<'Workspace'>;

function MemoryConnectorWorkspaceTemplateContent({ config }: MemoryConnectorTemplateProps) {
  const configRecord = config as Record<string, unknown>;
  const staticConfig = isRecord(configRecord.staticConfig)
    ? (configRecord.staticConfig as Record<string, unknown>)
    : undefined;

  const placement = typeof staticConfig?.placement === 'string' ? staticConfig.placement : undefined;
  const content = typeof staticConfig?.content === 'string' ? staticConfig.content : undefined;
  const maxChars = typeof staticConfig?.maxChars === 'number' ? staticConfig.maxChars : undefined;
  const maxCharsLabel = typeof maxChars === 'number' ? maxChars.toLocaleString('en-US') : undefined;

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-[var(--agyn-dark)] font-semibold">Memory connector</h3>
        <p className="text-sm text-[var(--agyn-gray)] mt-2">
          Injects aggregated memory into downstream prompts. Configuration is read-only while the connector is managed by the runtime.
        </p>
      </section>

      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--agyn-gray)]">
          Static configuration
        </h4>
        {staticConfig ? (
          <div className="mt-3 grid grid-cols-1 gap-3">
            <div>
              <div className="text-xs uppercase text-[var(--agyn-gray)]">Placement</div>
              <div className="text-sm text-[var(--agyn-dark)]">{placement ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-[var(--agyn-gray)]">Content mode</div>
              <div className="text-sm text-[var(--agyn-dark)]">{content ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-[var(--agyn-gray)]">Character limit</div>
              <div className="text-sm text-[var(--agyn-dark)]">{maxCharsLabel ?? '—'}</div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[var(--agyn-gray)] mt-3">
            No static configuration has been provisioned for this memory connector yet.
          </p>
        )}
      </section>
    </div>
  );
}

export function MemoryConnectorWorkspaceTemplateView(props: MemoryConnectorTemplateProps) {
  return <MemoryConnectorWorkspaceTemplateContent {...props} />;
}

export default MemoryConnectorWorkspaceTemplateView;
