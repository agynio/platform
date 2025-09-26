import type { JsonSchemaObject } from './types';
import type { UiSchemaFieldOptions, UiSchema } from './types';

export function buildUiSchema(schema: JsonSchemaObject | null): UiSchema {
  const ui: UiSchema = { 'ui:submitButtonOptions': { norender: true } };
  const props = (schema && typeof schema === 'object' && 'properties' in schema ? (schema as { properties?: Record<string, JsonSchemaObject & Record<string, unknown>> }).properties : undefined) || {};
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
      ui[key] = { ...(typeof widget === 'string' ? { 'ui:widget': widget } : {}), ...(options && typeof options === 'object' ? { 'ui:options': options as Record<string, unknown> } : {}) } as UiSchemaFieldOptions;
    }
  }
  return ui;
}
