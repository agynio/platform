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

    // Build merged ui:* with $ref-derived first, then property-level overrides
    let mergedUi: Partial<UiSchemaFieldOptions> = {};
    if (Object.keys(refUi).length || typeof widget === 'string' || options || typeof uiField === 'string') {
      mergedUi = {
        ...(refUi['ui:widget'] ? { 'ui:widget': refUi['ui:widget'] } : {}),
        ...(refUi['ui:options'] ? { 'ui:options': refUi['ui:options'] } : {}),
        ...(refUi['ui:field'] ? { 'ui:field': refUi['ui:field'] } : {}),
        ...(typeof widget === 'string' ? { 'ui:widget': widget } : {}),
        ...(options && typeof options === 'object' ? { 'ui:options': options as Record<string, unknown> } : {}),
      } as UiSchemaFieldOptions;
      if (typeof uiField === 'string') (mergedUi as UiSchemaFieldOptions)['ui:field'] = uiField;
    }

    // Decide KeyValueField only for free-form maps with no declared properties
    // - additionalProperties === true OR is a schema object
    // - AND there are no 'properties'
    // - DO NOT override if a ui:field is already present via inheritance or property-level
    const isObjectType = valObj.type === 'object';
    const hasDeclaredProps = !!(valObj as any).properties && Object.keys(((valObj as any).properties as Record<string, unknown>) || {}).length > 0;
    const ap = (valObj as any).additionalProperties as unknown;
    const isFreeFormMap = isObjectType && (ap === true || (ap && typeof ap === 'object')) && !hasDeclaredProps;
    const hasAnyUiField = typeof (mergedUi as UiSchemaFieldOptions)['ui:field'] === 'string';

    if (isFreeFormMap && !hasAnyUiField) {
      ui[key] = { 'ui:field': 'KeyValueField' } as UiSchemaFieldOptions;
      continue;
    }

    if (Object.keys(mergedUi).length) {
      ui[key] = mergedUi as UiSchemaFieldOptions;
    }
  }
  return ui;
}
