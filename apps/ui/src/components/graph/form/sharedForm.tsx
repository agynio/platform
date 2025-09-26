import Form from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import { useMemo, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import type { ReactNode } from 'react';

// Types
export type JsonSchemaObject = { [k: string]: unknown };

// KeyValue field
interface KeyValueFieldProps {
  formData?: Record<string, unknown>;
  onChange: (val: Record<string, unknown>) => void;
  disabled?: boolean;
  readonly?: boolean;
}
const KeyValueField = ({ formData, onChange, disabled, readonly }: KeyValueFieldProps) => {
  const entries = Object.entries(formData || {});
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const update = (k: string, v: unknown) => {
    const next = { ...(formData || {}) } as Record<string, unknown>;
    next[k] = v;
    onChange(next);
  };
  const remove = (k: string) => {
    const next = { ...(formData || {}) } as Record<string, unknown>;
    delete next[k];
    onChange(next);
  };
  const add = () => {
    if (!newKey.trim()) return;
    if ((formData || {})[newKey]) return;
    const next = { ...(formData || {}) } as Record<string, unknown>;
    next[newKey] = newValue;
    onChange(next);
    setNewKey('');
    setNewValue('');
  };
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        {entries.length === 0 && <div className="text-[10px] text-muted-foreground">No entries</div>}
        {entries.map(([k, v]) => (
          <div key={k} className="flex items-center gap-2">
            <input
              className="w-40 rounded border bg-background px-2 py-1 text-[11px] font-mono"
              value={k}
              disabled
              readOnly
            />
            <input
              className="flex-1 rounded border bg-background px-2 py-1 text-[11px] font-mono"
              value={typeof v === 'string' || typeof v === 'number' ? String(v) : ''}
              onChange={(e) => update(k, e.target.value)}
              disabled={disabled || readonly}
            />
            <button
              type="button"
              className="text-xs px-2 py-1 rounded border hover:bg-destructive/10 text-destructive"
              onClick={() => remove(k)}
              disabled={disabled || readonly}
              aria-label={`Remove ${k}`}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          className="w-40 rounded border bg-background px-2 py-1 text-[11px] font-mono"
          placeholder="key"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          disabled={disabled || readonly}
        />
        <input
          className="flex-1 rounded border bg-background px-2 py-1 text-[11px] font-mono"
          placeholder="value"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          disabled={disabled || readonly}
        />
        <button
          type="button"
          className="text-xs px-2 py-1 rounded border hover:bg-accent/50"
          onClick={add}
          disabled={disabled || readonly || !newKey.trim()}
        >
          Add
        </button>
      </div>
    </div>
  );
};

// Humanize labels
const humanizeLabel = (raw: string) => {
  if (!raw) return raw;
  if (/\s/.test(raw)) return raw;
  const spaced = raw
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

interface FieldTemplateProps {
  id: string;
  label?: string;
  required?: boolean;
  description?: ReactNode;
  errors?: ReactNode;
  children: ReactNode;
}
const FieldTemplate = (props: FieldTemplateProps) => {
  const { id, label, required, description, errors, children } = props;
  const isRoot = id === 'root';
  if (isRoot) return <div className="space-y-3">{children}</div>;
  return (
    <div className="space-y-1" key={id}>
      {label && (
        <label htmlFor={id} className="mb-1 block text-[10px] uppercase text-muted-foreground">
          {humanizeLabel(label)}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      {children}
      {description && <div className="mt-1 text-[10px] text-muted-foreground">{description}</div>}
      {errors}
    </div>
  );
};

interface ObjectFieldTemplateProps {
  idSchema?: { $id?: string };
  properties?: Array<{ content: ReactNode }>;
  description?: ReactNode;
  errors?: ReactNode;
}
const ObjectFieldTemplate = (props: ObjectFieldTemplateProps) => {
  const isRoot = props.idSchema?.$id === 'root';
  return (
    <div className={isRoot ? 'space-y-3' : ''}>
      {props.properties?.map((p) => p.content)}
      {props.description}
      {props.errors}
    </div>
  );
};

interface WidgetCommonProps {
  id: string;
  value: unknown;
  onChange: (val: unknown) => void;
  options?: Record<string, unknown>;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  readonly?: boolean;
  label?: string;
}
const widgets: Record<string, (p: WidgetCommonProps) => ReactNode> = {
  TextWidget: (p) => (
    <input
      id={p.id}
      value={typeof p.value === 'string' ? p.value : p.value == null ? '' : String(p.value)}
      onChange={(e) => p.onChange(e.target.value)}
      placeholder={p.placeholder || (p.options?.placeholder as string | undefined)}
      className="w-full rounded border bg-background px-2 py-1 text-xs"
    />
  ),
  TextareaWidget: (p) => (
    <textarea
      id={p.id}
      value={typeof p.value === 'string' ? p.value : p.value == null ? '' : String(p.value)}
      onChange={(e) => p.onChange(e.target.value)}
      rows={6}
      className="w-full font-mono rounded border bg-background px-2 py-1 text-[10px]"
    />
  ),
  NumberWidget: (p) => (
    <input
      id={p.id}
      type="number"
      value={typeof p.value === 'number' ? p.value : p.value == null ? '' : Number(p.value)}
      onChange={(e) => p.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      className="w-full rounded border bg-background px-2 py-1 text-xs"
    />
  ),
  CheckboxWidget: (p) => (
    <div className="flex items-center h-5">
      <Switch
        id={p.id}
        checked={Boolean(p.value)}
        onCheckedChange={(checked) => p.onChange(checked)}
        disabled={p.disabled || p.readonly}
      />
    </div>
  ),
};

export interface UiSchemaFieldOptions {
  'ui:widget'?: string;
  'ui:options'?: Record<string, unknown>;
  'ui:field'?: string;
}
export type UiSchema = Record<string, UiSchemaFieldOptions | unknown> & {
  'ui:submitButtonOptions': { norender: boolean };
};

export function buildUiSchema(schema: JsonSchemaObject | null): UiSchema {
  const ui: UiSchema = { 'ui:submitButtonOptions': { norender: true } };
  const props =
    (schema && typeof schema === 'object' && 'properties' in schema
      ? (schema as { properties?: Record<string, JsonSchemaObject & Record<string, unknown>> }).properties
      : undefined) || {};
  for (const [key, val] of Object.entries(props)) {
    if (!val || typeof val !== 'object') continue;
    const widget = (val as Record<string, unknown>)['ui:widget'];
    const options = (val as Record<string, unknown>)['ui:options'];
    const valObj = val as Record<string, unknown>;
    if (valObj.type === 'object' && 'additionalProperties' in valObj) {
      ui[key] = { 'ui:field': 'KeyValueField' } as UiSchemaFieldOptions;
      continue;
    }
    if (typeof widget === 'string' || options) {
      ui[key] = {
        ...(typeof widget === 'string' ? { 'ui:widget': widget } : {}),
        ...(options && typeof options === 'object' ? { 'ui:options': options as Record<string, unknown> } : {}),
      } as UiSchemaFieldOptions;
    }
  }
  return ui;
}

export const fieldsRegistry = { KeyValueField } as Record<string, unknown>;
export const templates = { FieldTemplate, ObjectFieldTemplate } as unknown as Record<string, unknown>;
export const sharedWidgets = widgets;

// Normalization similar to StaticConfigForm
export function normalizeForRjsf(schema: JsonSchemaObject | null): JsonSchemaObject | null {
  if (!schema) return null;
  type SchemaLike = JsonSchemaObject & {
    $ref?: string;
    definitions?: Record<string, JsonSchemaObject>;
    $defs?: Record<string, JsonSchemaObject>;
    $schema?: string;
  };
  const s: SchemaLike = { ...schema } as SchemaLike;
  let candidate: JsonSchemaObject = s;
  const defName = 'SimpleAgentStaticConfig';
  if (s.$ref && typeof s.$ref === 'string') {
    const ref = s.$ref.replace(/^#\/(definitions|\$defs)\//, '');
    const defs = (s.definitions || s.$defs) as Record<string, JsonSchemaObject> | undefined;
    if (defs) {
      if (defs[ref]) candidate = defs[ref];
      else if (defs[defName]) candidate = defs[defName];
    }
  } else if (s.definitions?.[defName]) {
    candidate = s.definitions[defName];
  } else if (s.$defs?.[defName]) {
    candidate = s.$defs[defName];
  }
  const out: JsonSchemaObject = { ...candidate };
  if ('$schema' in out) delete (out as { $schema?: unknown }).$schema;
  return out;
}

// Generic reusable form wrapper
export interface ReusableFormProps {
  schema: JsonSchemaObject;
  formData?: Record<string, unknown>;
  onChange?: (data: Record<string, unknown>) => void;
  disableSubmit?: boolean;
  onSubmit?: (data: Record<string, unknown>) => void;
}
export function ReusableForm({ schema, formData, onChange, disableSubmit = true, onSubmit }: ReusableFormProps) {
  const uiSchema = useMemo(() => buildUiSchema(schema), [schema]);
  return (
    <Form
      schema={schema as JsonSchemaObject}
      formData={formData}
      validator={validator}
      uiSchema={uiSchema as unknown as Record<string, unknown>}
      templates={templates} // @ts-expect-error registry typing
      fields={fieldsRegistry}
      widgets={sharedWidgets}
      onChange={({ formData: next }) => onChange?.(next as Record<string, unknown>)}
      onSubmit={({ formData: submitData }) => onSubmit?.(submitData as Record<string, unknown>)}
    >
      {!disableSubmit && (
        <button type="submit" className="mt-2 rounded border px-2 py-1 text-xs hover:bg-accent/50">
          Save
        </button>
      )}
    </Form>
  );
}
