import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { EntityUpsertForm } from '@/components/entities/EntityUpsertForm';
import { useTeamEntities } from '@/features/entities/hooks/useTeamEntities';
import {
  getTemplateOptions,
  limitTemplateOptionsForKind,
  mapTeamAttachmentsToEdges,
  mapTeamEntitiesToGraphNodes,
} from '@/features/entities/api/teamEntities';
import type { GraphEntityKind } from '@/features/entities/types';
import type { GraphNodeConfig, GraphPersistedEdge } from '@/features/graph/types';

interface EntityUpsertPageProps {
  kind: GraphEntityKind;
  mode: 'create' | 'edit';
  listPath: string;
  templateIncludeNames?: ReadonlySet<string>;
  templateExcludeNames?: ReadonlySet<string>;
}

export function EntityUpsertPage({
  kind,
  mode,
  listPath,
  templateIncludeNames,
  templateExcludeNames,
}: EntityUpsertPageProps) {
  const navigate = useNavigate();
  const { entityId } = useParams<{ entityId?: string }>();
  const { entities, createEntity, updateEntity, templatesQuery, attachmentsQuery, isSaving, isLoading } = useTeamEntities();

  const templates = useMemo(() => {
    const options = getTemplateOptions(templatesQuery.data ?? [], kind, templateExcludeNames);
    const filtered = !templateIncludeNames || templateIncludeNames.size === 0
      ? options
      : options.filter((option) => templateIncludeNames.has(option.name));
    return limitTemplateOptionsForKind(filtered, kind);
  }, [kind, templateExcludeNames, templateIncludeNames, templatesQuery.data]);

  const graphNodes = useMemo<GraphNodeConfig[]>(() => {
    return mapTeamEntitiesToGraphNodes(entities, templatesQuery.data ?? []);
  }, [entities, templatesQuery.data]);

  const graphEdges = useMemo<GraphPersistedEdge[]>(() => {
    return mapTeamAttachmentsToEdges(attachmentsQuery.data);
  }, [attachmentsQuery.data]);

  const editableEntity = mode === 'edit' ? entities.find((item) => item.id === entityId) : undefined;
  const showForm = mode === 'create' || Boolean(editableEntity);

  const handleSubmit = async (input: Parameters<typeof createEntity>[0]) => {
    if (mode === 'edit') {
      await updateEntity(input);
    } else {
      await createEntity(input);
    }
    navigate(listPath, { replace: true });
  };

  const handleCancel = () => {
    navigate(listPath);
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-white">
      {showForm ? (
        <EntityUpsertForm
          mode={mode}
          kind={kind}
          entity={mode === 'edit' ? editableEntity : undefined}
          templates={templates}
          isSubmitting={isSaving}
          graphNodes={graphNodes}
          graphEdges={graphEdges}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
        />
      ) : (
        !isLoading && (
          <div className="flex flex-1 items-center justify-center px-6 py-12">
            <Alert variant="destructive" className="max-w-xl">
              <AlertTitle>Entity not found</AlertTitle>
              <AlertDescription>The requested entity could not be located.</AlertDescription>
            </Alert>
          </div>
        )
      )}
      {isLoading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/70 text-sm font-medium text-[var(--agyn-text-subtle)]">
          Loading entity…
        </div>
      )}
    </div>
  );
}
