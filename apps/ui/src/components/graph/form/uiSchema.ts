import type { JsonSchemaObject } from './types';
import type { UiSchemaFieldOptions, UiSchema } from './types';

export function buildUiSchema(schema: JsonSchemaObject | null): UiSchema {
  const ui: UiSchema = { 'ui:submitButtonOptions': { norender: true } };
  const props = (schema && typeof schema === 'object' && 'properties' in schema ? (schema as { properties?: Record<string, JsonSchemaObject & Record<string, unknown>> }).properties : undefined) || {};
  for (const [key, val] of Object.entries(props)) {
    if (!val || typeof val !== 'object') continue;
    const valObj = val as Record<string, unknown>;

    // Resolve $ref target and inherit ui:* from referenced schema (ui:field, ui:widget, ui:options)
    // Property-level ui:* takes precedence over $ref-level.
    let refUi: Partial<UiSchemaFieldOptions> = {};
    const schemaObj = (schema || {}) as Record<string, unknown>;
    const defs = (schemaObj.definitions || schemaObj.$defs) as Record<string, JsonSchemaObject & Record<string, unknown>> | undefined;
    const ref = typeof valObj.$ref === 'string' ? (valObj.$ref as string) : undefined;
    if (defs && ref) {
      const name = ref.replace(/^#\/(definitions|\$defs)\//, '');
      const target = defs[name] as (JsonSchemaObject & Record<string, unknown>) | undefined;
      if (target && typeof target === 'object') {
        const tWidget = target['ui:widget'];
        const tOptions = target['ui:options'];
        const tField = target['ui:field'];
        if (typeof tWidget === 'string') refUi['ui:widget'] = tWidget;
        if (tOptions && typeof tOptions === 'object') refUi['ui:options'] = tOptions as Record<string, unknown>;
        if (typeof tField === 'string') refUi['ui:field'] = tField;
      }
    }

    const widget = (val as Record<string, unknown>)['ui:widget'];
    const options = (val as Record<string, unknown>)['ui:options'];
    const uiField = (val as Record<string, unknown>)['ui:field'];
    if (valObj.type === 'object' && 'additionalProperties' in valObj) {
      ui[key] = { 'ui:field': 'KeyValueField' } as UiSchemaFieldOptions;
      continue;
    }
    // Merge ref-derived first then property-level to honor precedence
    if (Object.keys(refUi).length || typeof widget === 'string' || options || typeof uiField === 'string') {
      ui[key] = {
        ...(refUi['ui:widget'] ? { 'ui:widget': refUi['ui:widget'] } : {}),
        ...(refUi['ui:options'] ? { 'ui:options': refUi['ui:options'] } : {}),
        ...(refUi['ui:field'] ? { 'ui:field': refUi['ui:field'] } : {}),
        ...(typeof widget === 'string' ? { 'ui:widget': widget } : {}),
        ...(options && typeof options === 'object' ? { 'ui:options': options as Record<string, unknown> } : {}),
      } as UiSchemaFieldOptions;
      if (typeof uiField === 'string') (ui[key] as UiSchemaFieldOptions)['ui:field'] = uiField;
    }
  }
  return ui;
}
