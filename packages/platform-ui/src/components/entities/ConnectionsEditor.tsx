import { Fragment, useMemo } from 'react';
import type {
  Control,
  FieldArrayWithId,
  FieldPath,
  UseFieldArrayAppend,
  UseFieldArrayRemove,
  UseFormSetValue,
} from 'react-hook-form';
import { useWatch } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import type { EntityPortDefinition, GraphEntitySummary } from '@/features/entities/types';
import type { EntityFormValues, IncomingConnectionField, OutgoingConnectionField } from './formTypes';

type BaseEditorProps = {
  title: string;
  description: string;
  control: Control<EntityFormValues>;
  setValue: UseFormSetValue<EntityFormValues>;
  currentNodeId?: string | null;
  currentPorts: { inputs: EntityPortDefinition[]; outputs: EntityPortDefinition[] };
  nodes: GraphEntitySummary[];
  disabled?: boolean;
};

type OutgoingEditorProps = BaseEditorProps & {
  variant: 'outgoing';
  fields: FieldArrayWithId<EntityFormValues, 'outgoing', 'id'>[];
  append: UseFieldArrayAppend<EntityFormValues, 'outgoing'>;
  remove: UseFieldArrayRemove;
};

type IncomingEditorProps = BaseEditorProps & {
  variant: 'incoming';
  fields: FieldArrayWithId<EntityFormValues, 'incoming', 'id'>[];
  append: UseFieldArrayAppend<EntityFormValues, 'incoming'>;
  remove: UseFieldArrayRemove;
};

type ConnectionsEditorProps = OutgoingEditorProps | IncomingEditorProps;

type ConnectionRow = {
  id?: string;
  edgeId?: string;
  sourceNodeId?: string;
  targetNodeId?: string;
  sourceHandle?: string;
  targetHandle?: string;
};

function randomKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 10);
}

export function ConnectionsEditor({
  title,
  description,
  variant,
  control,
  setValue,
  fields,
  append,
  remove,
  currentNodeId,
  currentPorts,
  nodes,
  disabled,
}: ConnectionsEditorProps) {
  const name = variant;
  const rowValues = (useWatch({ control, name }) as ConnectionRow[] | undefined) ?? [];

  const otherNodes = useMemo(() => nodes.filter((node) => node.id !== currentNodeId), [nodes, currentNodeId]);
  const nodeById = useMemo(() => new Map(otherNodes.map((node) => [node.id, node])), [otherNodes]);

  const canAddConnections = (() => {
    if (variant === 'outgoing') {
      return currentPorts.outputs.length > 0 && otherNodes.length > 0;
    }
    return currentPorts.inputs.length > 0 && otherNodes.length > 0;
  })();

  const handleAdd = () => {
    if (!canAddConnections) return;
    if (variant === 'outgoing') {
      append({
        id: randomKey(),
        edgeId: undefined,
        targetNodeId: '',
        sourceHandle: '',
        targetHandle: '',
      } satisfies OutgoingConnectionField);
      return;
    }
    append({
      id: randomKey(),
      edgeId: undefined,
      sourceNodeId: '',
      sourceHandle: '',
      targetHandle: '',
    } satisfies IncomingConnectionField);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--agyn-dark)]">{title}</p>
          <p className="text-xs text-[var(--agyn-text-subtle)]">{description}</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleAdd}
          disabled={disabled || !canAddConnections}
        >
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>
      {fields.length === 0 ? (
        <p className="text-xs text-[var(--agyn-text-subtle)]">No connections configured.</p>
      ) : (
        <div className="space-y-2">
          {fields.map((field, index) => {
            const row = rowValues[index] ?? {};
            const selectedNodeId = variant === 'outgoing' ? row.targetNodeId : row.sourceNodeId;
            const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) : undefined;
            const availableTargetHandles = variant === 'outgoing' ? selectedNode?.ports.inputs ?? [] : currentPorts.inputs;
            const availableSourceHandles = variant === 'outgoing' ? currentPorts.outputs : selectedNode?.ports.outputs ?? [];

            const nodeFieldName = (
              variant === 'outgoing'
                ? `outgoing.${index}.targetNodeId`
                : `incoming.${index}.sourceNodeId`
            ) as FieldPath<EntityFormValues>;
            const sourceHandleFieldName = (
              variant === 'outgoing'
                ? `outgoing.${index}.sourceHandle`
                : `incoming.${index}.sourceHandle`
            ) as FieldPath<EntityFormValues>;
            const targetHandleFieldName = (
              variant === 'outgoing'
                ? `outgoing.${index}.targetHandle`
                : `incoming.${index}.targetHandle`
            ) as FieldPath<EntityFormValues>;

            return (
              <div
                key={field.id ?? index}
                className="grid grid-cols-1 gap-2 rounded-md border border-[var(--agyn-border-subtle)] p-3 sm:grid-cols-[1.2fr_1fr_1fr_auto]"
              >
                <FormField
                  control={control}
                  name={nodeFieldName}
                  render={({ field }) => {
                    const nodeValue = typeof field.value === 'string' ? field.value : '';
                    return (
                      <FormItem>
                        <FormLabel className="text-xs text-[var(--agyn-text-subtle)]">
                          {variant === 'outgoing' ? 'Target node' : 'Source node'}
                        </FormLabel>
                        <Select
                          disabled={disabled}
                          value={nodeValue}
                          onValueChange={(value) => {
                            field.onChange(value);
                            setValue(targetHandleFieldName, '');
                            if (variant === 'incoming') {
                              setValue(sourceHandleFieldName, '');
                            }
                          }}
                        >
                          <FormControl>
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Select node" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {otherNodes.map((node) => (
                              <SelectItem key={node.id} value={node.id}>
                                <div className="flex flex-col text-left">
                                  <span className="text-sm font-medium">{node.title}</span>
                                  <span className="text-xs text-muted-foreground">{node.id}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />

                <FormField
                  control={control}
                  name={sourceHandleFieldName}
                  render={({ field }) => {
                    const handleValue = typeof field.value === 'string' ? field.value : '';
                    return (
                      <FormItem>
                        <FormLabel className="text-xs text-[var(--agyn-text-subtle)]">Source handle</FormLabel>
                        <Select
                          disabled={disabled || availableSourceHandles.length === 0}
                          value={handleValue}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder={availableSourceHandles.length === 0 ? 'No handles' : 'Select handle'} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {availableSourceHandles.map((handle) => (
                              <SelectItem key={handle.id} value={handle.id}>
                                {handle.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />

                <FormField
                  control={control}
                  name={targetHandleFieldName}
                  render={({ field }) => {
                    const handleValue = typeof field.value === 'string' ? field.value : '';
                    return (
                      <FormItem>
                        <FormLabel className="text-xs text-[var(--agyn-text-subtle)]">Target handle</FormLabel>
                        <Select
                          disabled={disabled || availableTargetHandles.length === 0}
                          value={handleValue}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder={availableTargetHandles.length === 0 ? 'No handles' : 'Select handle'} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {availableTargetHandles.map((handle) => (
                              <Fragment key={handle.id}>
                                <SelectItem value={handle.id}>{handle.label}</SelectItem>
                              </Fragment>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />

                <div className="flex items-end justify-end">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="text-[var(--agyn-text-subtle)]"
                    onClick={() => remove(index)}
                    disabled={disabled}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
