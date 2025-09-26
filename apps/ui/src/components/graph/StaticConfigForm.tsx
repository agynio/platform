// Static configuration autosave form
import { useEffect, useRef, useState } from 'react';
import { useTemplatesCache } from '../../lib/graph/templates.provider';
import { normalizeForRjsf } from './form/normalize';
import { ReusableForm } from './form/ReusableForm';
import type { JsonSchemaObject } from './form/types';

function coerceSchema(s: unknown): JsonSchemaObject | null {
  return s && typeof s === 'object' ? (s as JsonSchemaObject) : null;
}

export default function StaticConfigForm({
  templateName,
  initialConfig,
  onConfigChange,
  submitDisabled,
}: {
  nodeId: string;
  templateName: string;
  initialConfig?: Record<string, unknown>;
  onConfigChange?: (cfg: Record<string, unknown>) => void;
  submitDisabled?: boolean;
}) {
  const { getTemplate } = useTemplatesCache();
  const t = getTemplate(templateName);
  const rawSchema = coerceSchema(t?.staticConfigSchema);

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

  if (!schema) {
    return <div className="text-sm text-gray-600">No static config available</div>;
  }

  return (
    <div className="space-y-2">
      <ReusableForm
        schema={schema as JsonSchemaObject}
        formData={formData}
        disableSubmit={true} // always hide submit button now
        submitDisabled={submitDisabled}
        onChange={(next) => {
          touched.current = true;
          setFormData(next as Record<string, unknown>);
          onConfigChange?.(next as Record<string, unknown>);
        }}
      />
    </div>
  );
}
