import Form from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import { useMemo } from 'react';
import type { JsonSchemaObject } from './types';
import { buildUiSchema } from './uiSchema';
import { templates } from './templates';
import { widgets } from './widgets';
import { fieldsRegistry } from './fieldRegistry';

export interface ReusableFormProps {
  schema: JsonSchemaObject;
  formData?: Record<string, unknown>;
  onChange?: (data: Record<string, unknown>) => void;
  disableSubmit?: boolean;
  onSubmit?: (data: Record<string, unknown>) => void;
  submitDisabled?: boolean; // external pending state
  hideSubmitButton?: boolean; // force hide even if disableSubmit false
}
export function ReusableForm({
  schema,
  formData,
  onChange,
  disableSubmit = true,
  onSubmit,
  submitDisabled,
  hideSubmitButton,
}: ReusableFormProps) {
  const uiSchema = useMemo(() => buildUiSchema(schema), [schema]);
  return (
    <Form
      schema={schema as JsonSchemaObject}
      formData={formData}
      validator={validator}
      uiSchema={uiSchema as unknown as Record<string, unknown>}
      templates={templates}
      // @ts-expect-error registry typing mismatch
      fields={fieldsRegistry}
      widgets={widgets}
      onChange={({ formData: next }) => onChange?.(next as Record<string, unknown>)}
      onSubmit={({ formData: submitData }) => onSubmit?.(submitData as Record<string, unknown>)}
    >
      {!disableSubmit && !hideSubmitButton && (
        <button
          type="submit"
          disabled={submitDisabled}
          className="mt-2 rounded border px-2 py-1 text-xs hover:bg-accent/50 disabled:opacity-50"
        >
          Save
        </button>
      )}
    </Form>
  );
}
