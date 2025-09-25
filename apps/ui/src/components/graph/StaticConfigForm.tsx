import React from 'react';
import { useTemplatesCache } from '../../lib/graph/templates.provider';
import { useSetNodeConfig } from '../../lib/graph/hooks';
import Form from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';

function coerceSchema(s: unknown): any | null {
  return s && typeof s === 'object' ? (s as any) : null;
}

export default function StaticConfigForm({ nodeId, templateName, initialConfig }: { nodeId: string; templateName: string; initialConfig?: Record<string, unknown> }) {
  const { getTemplate } = useTemplatesCache();
  const t = getTemplate(templateName);
  const schema = coerceSchema(t?.staticConfigSchema);
  const mutation = useSetNodeConfig(nodeId);

  if (!schema) {
    return <div className="text-sm text-gray-600">No static config available</div>;
  }

  return (
    <div className="space-y-2">
      <Form
        schema={schema}
        formData={initialConfig}
        validator={validator}
        onSubmit={({ formData }) =>
          mutation.mutate(formData as Record<string, unknown>, {
            onSuccess: () => alert('Saved'),
            onError: () => alert('Failed to save'),
          })
        }
      >
        <button type="submit" className="px-3 py-1 rounded bg-blue-600 text-white disabled:opacity-50" disabled={mutation.isPending}>
          Save
        </button>
      </Form>
    </div>
  );
}
