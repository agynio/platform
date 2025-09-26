import { useState } from 'react';
import { useDynamicConfig, useNodeStatus } from '../../lib/graph/hooks';
import { ReusableForm } from './form/ReusableForm';
import type { JsonSchemaObject } from './form/types';

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

  if (!ready) {
    return <div className="text-sm text-gray-600">Dynamic config not available yet</div>;
  }

  const jsonSchema = (schema.data || { type: 'object', properties: {} }) as JsonSchemaObject;

  return (
    <div className="space-y-2">
      <ReusableForm
        schema={jsonSchema}
        formData={formData}
        disableSubmit={true}
        hideSubmitButton
        submitDisabled={isPending}
        onChange={(next) => {
          // touched.current = true;
          setFormData(next as Record<string, unknown>);
          onConfigChange?.(next as Record<string, unknown>);
        }}
      />
    </div>
  );
}
