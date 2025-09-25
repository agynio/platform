// Minimal JSON Schema type definitions to satisfy import('schema-json').JSONSchema
// This package is private and only used for typing within the monorepo.

declare module 'schema-json' {
  export interface JSONSchema {
    $id?: string;
    $schema?: string;
    type?: string | string[];
    properties?: Record<string, JSONSchema>;
    items?: JSONSchema | JSONSchema[];
    required?: string[];
    additionalProperties?: boolean | JSONSchema;
    enum?: any[];
    oneOf?: JSONSchema[];
    anyOf?: JSONSchema[];
    allOf?: JSONSchema[];
    minimum?: number;
    maximum?: number;
    default?: any;
    description?: string;
    format?: string;
    [k: string]: any;
  }
}
