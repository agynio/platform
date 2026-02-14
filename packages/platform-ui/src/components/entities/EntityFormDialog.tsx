import { useEffect, useMemo, useRef } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConnectionsEditor } from '@/components/entities/ConnectionsEditor';
import { ENTITY_SELF_PLACEHOLDER, extractNodeConnections, getTemplatePorts } from '@/features/entities/api/graphEntities';
import type {
  EntityPortGroup,
  GraphEntityConnectionInput,
  GraphEntityKind,
  GraphEntitySummary,
  GraphEntityUpsertInput,
  TemplateOption,
} from '@/features/entities/types';
import type { EntityFormValues } from './formTypes';

interface EntityFormDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  kind: GraphEntityKind;
  entity?: GraphEntitySummary;
  templates: TemplateOption[];
  allNodes: GraphEntitySummary[];
  connections: GraphEntityConnectionInput[];
  isSubmitting?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: GraphEntityUpsertInput) => Promise<void>;
}

function toConfigText(config: Record<string, unknown> | undefined): string {
  try {
    return JSON.stringify(config ?? {}, null, 2);
  } catch (error) {
    console.warn('Config serialization failed', error);
    return '{\n  "title": ""\n}';
  }
}

function createConnectionFieldId(prefix: string, edgeId?: string) {
  if (edgeId) return edgeId;
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function EntityFormDialog({
  open,
  mode,
  kind,
  entity,
  templates,
  allNodes,
  connections,
  isSubmitting,
  onOpenChange,
  onSubmit,
}: EntityFormDialogProps) {
  const templateMap = useMemo(() => new Map(templates.map((tpl) => [tpl.name, tpl])), [templates]);
  const connectionDefaults = useMemo(() => {
    if (!entity) {
      return { incoming: [], outgoing: [] };
    }
    return extractNodeConnections(entity.id, connections);
  }, [connections, entity]);

  const defaultValues: EntityFormValues = useMemo(
    () => ({
      template: entity?.templateName ?? '',
      title: entity?.title ?? '',
      configText: toConfigText(entity?.config),
      outgoing: connectionDefaults.outgoing.map((conn) => ({
        id: createConnectionFieldId('out', conn.id),
        edgeId: conn.id,
        targetNodeId: conn.target,
        sourceHandle: conn.sourceHandle,
        targetHandle: conn.targetHandle,
      })),
      incoming: connectionDefaults.incoming.map((conn) => ({
        id: createConnectionFieldId('in', conn.id),
        edgeId: conn.id,
        sourceNodeId: conn.source,
        sourceHandle: conn.sourceHandle,
        targetHandle: conn.targetHandle,
      })),
    }),
    [connectionDefaults.incoming, connectionDefaults.outgoing, entity],
  );

  const form = useForm<EntityFormValues>({
    defaultValues,
  });
  const outgoingArray = useFieldArray({ control: form.control, name: 'outgoing' });
  const incomingArray = useFieldArray({ control: form.control, name: 'incoming' });

  useEffect(() => {
    if (open) {
      form.reset(defaultValues);
    }
  }, [defaultValues, form, open]);

  const selectedTemplateName = form.watch('template');
  const selectedTemplate = selectedTemplateName ? templateMap.get(selectedTemplateName)?.source : undefined;
  const currentPorts: EntityPortGroup = useMemo(() => {
    if (selectedTemplate) {
      return getTemplatePorts(selectedTemplate);
    }
    if (entity) {
      return entity.ports;
    }
    return { inputs: [], outputs: [] };
  }, [entity, selectedTemplate]);

  const templateRef = useRef<string | undefined>(entity?.templateName);
  useEffect(() => {
    if (mode !== 'create') return;
    if (templateRef.current === selectedTemplateName) return;
    templateRef.current = selectedTemplateName;
    form.setValue('outgoing', []);
    form.setValue('incoming', []);
  }, [form, mode, selectedTemplateName]);

  const handleSubmit = async (values: EntityFormValues) => {
    let parsedConfig: unknown;
    try {
      parsedConfig = JSON.parse(values.configText || '{}');
    } catch (_error) {
      form.setError('configText', { type: 'manual', message: 'Invalid JSON. Please fix and retry.' });
      return;
    }
    if (!parsedConfig || typeof parsedConfig !== 'object' || Array.isArray(parsedConfig)) {
      form.setError('configText', { type: 'manual', message: 'Configuration must be a JSON object.' });
      return;
    }

    const outgoingConnections: GraphEntityConnectionInput[] = values.outgoing
      ?.map((conn) => ({
        id: conn.edgeId,
        source: ENTITY_SELF_PLACEHOLDER,
        sourceHandle: conn.sourceHandle?.trim() ?? '',
        target: conn.targetNodeId?.trim() ?? '',
        targetHandle: conn.targetHandle?.trim() ?? '',
      }))
      .filter((conn) => conn.target && conn.sourceHandle && conn.targetHandle) ?? [];

    const incomingConnections: GraphEntityConnectionInput[] = values.incoming
      ?.map((conn) => ({
        id: conn.edgeId,
        source: conn.sourceNodeId?.trim() ?? '',
        sourceHandle: conn.sourceHandle?.trim() ?? '',
        target: ENTITY_SELF_PLACEHOLDER,
        targetHandle: conn.targetHandle?.trim() ?? '',
      }))
      .filter((conn) => conn.source && conn.sourceHandle && conn.targetHandle) ?? [];

    const payload: GraphEntityUpsertInput = {
      id: entity?.id,
      template: entity?.templateName ?? values.template,
      title: values.title.trim(),
      config: parsedConfig as Record<string, unknown>,
      connections: [...outgoingConnections, ...incomingConnections],
    };

    if (!payload.template) {
      form.setError('template', { type: 'manual', message: 'Template is required.' });
      return;
    }

    if (!payload.title) {
      form.setError('title', { type: 'manual', message: 'Title is required.' });
      return;
    }

    try {
      await onSubmit(payload);
      onOpenChange(false);
    } catch (_error) {
      // errors are surfaced via notifications upstream; keep dialog open
      return;
    }
  };

  const disableTemplateSelect = mode === 'edit';
  const dialogTitle = mode === 'create' ? `Create ${kind}` : `Edit ${entity?.title ?? kind}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>
            Configure the template, metadata, and graph connections for this {kind}.
          </DialogDescription>
        </DialogHeader>
        {templates.length === 0 && (
          <Alert variant="destructive">
            <AlertDescription>No templates available. Please add templates before creating entities.</AlertDescription>
          </Alert>
        )}
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(handleSubmit)}>
            <FormField
              control={form.control}
              name="template"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Template</FormLabel>
                  <Select
                    value={field.value ?? ''}
                    onValueChange={field.onChange}
                    disabled={disableTemplateSelect || templates.length === 0 || isSubmitting}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a template" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {templates.map((tpl) => (
                        <SelectItem key={tpl.name} value={tpl.name}>
                          {tpl.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={isSubmitting} placeholder="Enter a friendly title" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="configText"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Config JSON</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={8}
                      className="font-mono text-sm"
                      disabled={isSubmitting}
                      spellCheck={false}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <ConnectionsEditor
              title="Outgoing connections"
              description="Connect this entity's outputs to downstream nodes."
              variant="outgoing"
              control={form.control}
              setValue={form.setValue}
              fields={outgoingArray.fields}
              append={outgoingArray.append}
              remove={outgoingArray.remove}
              currentNodeId={entity?.id}
              currentPorts={currentPorts}
              nodes={allNodes}
              disabled={isSubmitting || (!selectedTemplate && mode === 'create')}
            />

            <ConnectionsEditor
              title="Incoming connections"
              description="Link upstream nodes into this entity's inputs."
              variant="incoming"
              control={form.control}
              setValue={form.setValue}
              fields={incomingArray.fields}
              append={incomingArray.append}
              remove={incomingArray.remove}
              currentNodeId={entity?.id}
              currentPorts={currentPorts}
              nodes={allNodes}
              disabled={isSubmitting || (!selectedTemplate && mode === 'create')}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || (mode === 'create' && !form.getValues('template'))}>
                {mode === 'create' ? 'Create' : 'Save changes'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
