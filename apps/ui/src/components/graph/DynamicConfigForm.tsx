import { useEffect, useRef, useState } from 'react';
import { useDynamicConfig, useNodeStatus } from '../../lib/graph/hooks';
import { ReusableForm } from './form/ReusableForm';
import type { JsonSchemaObject } from './form/types';

function isValidJsonSchema(obj: unknown): obj is JsonSchemaObject {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return 'type' in o || 'properties' in o || '$ref' in o;
}

export default function DynamicConfigForm({
  nodeId,
  initialConfig,
  onConfigChange,
}: {
  nodeId: string;
  initialConfig: Record<string, unknown>;
  onConfigChange?: (cfg: Record<string, unknown>) => void;
}) {
  const { data: status } = useNodeStatus(nodeId);
  const ready = !!status?.dynamicConfigReady;
  const { schema, set } = useDynamicConfig(nodeId);
  const isPending = (set as { isPending?: boolean }).isPending === true;

  const [formData, setFormData] = useState<Record<string, unknown> | undefined>(initialConfig);

  // track if we have already attempted a refetch after becoming ready to avoid loops
  const didRefetchOnReady = useRef(false);
  useEffect(() => {
    if (ready && !schema.data && !didRefetchOnReady.current) {
      // react-query will refetch on invalidate elsewhere, but as a guard trigger here once
      didRefetchOnReady.current = true;
      // best effort: invalidate by resetting query data to undefined triggers refetch in some cases
      // rely primarily on useNodeStatus invalidation in hooks.ts
      schema.refetch?.();
    }
    if (!ready) didRefetchOnReady.current = false;
  }, [ready, schema]);

  if (!ready) {
    return <div className="text-sm text-gray-600">Dynamic config not available yet</div>;
  }

  // When ready but schema is null/invalid, render small placeholder and avoid passing to RJSF
  if (!isValidJsonSchema(schema.data)) {
    return <div className="text-xs text-gray-500">Loading dynamic config



</div>;
  }

  const jsonSchema = schema.data as JsonSchemaObject;

  return (
    <div className="space-y-2">
      <ReusableForm
        schema={jsonSchema}
        formData={formData}
        disableSubmit={true}
        hideSubmitButton
        submitDisabled={isPending}
        onChange={(next) => {
          setFormData(next as Record<string, unknown>);
          onConfigChange?.(next as Record<string, unknown>);
        }}
      />
    </div>
  );
}
