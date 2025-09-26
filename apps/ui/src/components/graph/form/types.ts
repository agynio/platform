export type JsonSchemaObject = { [k: string]: unknown };
export interface UiSchemaFieldOptions { 'ui:widget'?: string; 'ui:options'?: Record<string, unknown>; 'ui:field'?: string; }
export type UiSchema = Record<string, UiSchemaFieldOptions | unknown> & { 'ui:submitButtonOptions': { norender: boolean } };
