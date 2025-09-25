// Static configuration autosave form
import Form from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState, useMemo } from 'react';
import { useTemplatesCache } from '../../lib/graph/templates.provider';

type JsonSchemaObject = { [k: string]: unknown };
function coerceSchema(s: unknown): JsonSchemaObject | null {
  return s && typeof s === 'object' ? (s as JsonSchemaObject) : null;
}

export default function StaticConfigForm({
  templateName,
  initialConfig,
  onConfigChange,
}: {
  templateName: string;
  initialConfig?: Record<string, unknown>;
  onConfigChange?: (cfg: Record<string, unknown>) => void;
}) {
  const { getTemplate } = useTemplatesCache();
  const t = getTemplate(templateName);
  const rawSchema = coerceSchema(t?.staticConfigSchema);

  // Normalize raw Zod->JSON schema for RJSF (AJV draft-07) client-side.
  // 1. If root is just a $ref into definitions/$defs, extract the concrete object schema.
  // 2. Remove incompatible $schema field (e.g. draft 2020-12) so our AJV instance (draft-07) accepts it.
  // 3. Do NOT enforce a title here (avoids unwanted legend). The form template suppresses root legend.
  type SchemaLike = JsonSchemaObject & {
    $ref?: string;
    definitions?: Record<string, JsonSchemaObject>;
    $defs?: Record<string, JsonSchemaObject>;
    $schema?: string;
  };
  function normalizeForRjsf(schema: JsonSchemaObject | null): JsonSchemaObject | null {
    if (!schema) return null;
    const s: SchemaLike = { ...schema } as SchemaLike;
    let candidate: JsonSchemaObject = s;
    const defName = 'SimpleAgentStaticConfig';
    // If schema has a $ref to a definition, try to pull that definition out.
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
    // Shallow clone extracted root so mutations don't affect cache
    const out: JsonSchemaObject = { ...candidate };
    if ('$schema' in out) delete (out as { $schema?: unknown }).$schema;
    return out;
  }

  const schema = normalizeForRjsf(rawSchema);

  const [formData, setFormData] = useState<Record<string, unknown> | undefined>(initialConfig);
  const touched = useRef(false);
  const latest = useRef<Record<string, unknown> | undefined>(initialConfig);

  // Sync incoming initialConfig only when user hasn't started editing (avoid reset flash)
  useEffect(() => {
    if (!touched.current) {
      setFormData(initialConfig);
      latest.current = initialConfig;
    }
  }, [initialConfig]);

  // Humanize labels (camelCase, snake_case, kebab-case -> spaced; capitalize first word only)
  const humanizeLabel = (raw: string) => {
    if (!raw) return raw;
    if (/\s/.test(raw)) return raw; // already spaced
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

  // Custom widgets to enforce consistent styling
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
  } as const;

  // Build uiSchema automatically from any ui:* hints preserved in JSON schema (via Zod meta), with fallback heuristics.
  interface UiSchemaFieldOptions {
    'ui:widget'?: string;
    'ui:options'?: Record<string, unknown>;
  }
  type UiSchema = Record<string, UiSchemaFieldOptions | unknown> & {
    'ui:submitButtonOptions': { norender: boolean };
  };
  const uiSchema: UiSchema = useMemo(() => {
    const ui: UiSchema = { 'ui:submitButtonOptions': { norender: true } };

    const props =
      (schema && typeof schema === 'object' && 'properties' in schema
        ? (schema as { properties?: Record<string, JsonSchemaObject & Record<string, unknown>> }).properties
        : undefined) || {};
    for (const [key, val] of Object.entries(props)) {
      if (!val || typeof val !== 'object') continue;
      const widget = (val as Record<string, unknown>)['ui:widget'];
      const options = (val as Record<string, unknown>)['ui:options'];
      if (typeof widget === 'string' || options) {
        ui[key] = {
          ...(typeof widget === 'string' ? { 'ui:widget': widget } : {}),
          ...(options && typeof options === 'object' ? { 'ui:options': options as Record<string, unknown> } : {}),
        } as UiSchemaFieldOptions;
      }
    }
    return ui;
  }, [schema]);

  if (!schema) {
    return <div className="text-sm text-gray-600">No static config available</div>;
  }

  return (
    <div className="space-y-2">
      <Form
        schema={schema as JsonSchemaObject}
        formData={formData}
        validator={validator}
        uiSchema={uiSchema as unknown as Record<string, unknown>}
        templates={{ FieldTemplate, ObjectFieldTemplate } as unknown as Record<string, unknown>}
        widgets={widgets}
        onChange={({ formData: next }) => {
          touched.current = true;
          setFormData(next as Record<string, unknown>);
          onConfigChange?.(next as Record<string, unknown>);
        }}
      ></Form>
    </div>
  );
}
