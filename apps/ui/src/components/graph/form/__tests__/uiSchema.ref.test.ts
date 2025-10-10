import { describe, it, expect } from 'vitest';
import { buildUiSchema } from '../uiSchema';

describe('buildUiSchema - $ref ui inheritance', () => {
  it('inherits ui:* from $ref target and allows property override', () => {
    const schema = {
      type: 'object',
      properties: {
        token: { $ref: '#/$defs/TokenRef' },
        overrideToken: { $ref: '#/$defs/TokenRef', 'ui:field': 'CustomField' },
      },
      $defs: {
        TokenRef: { type: 'object', 'ui:field': 'ReferenceField' },
      },
    } as any;

    const ui = buildUiSchema(schema);
    // token inherits ReferenceField from $ref
    expect((ui.token as any)['ui:field']).toBe('ReferenceField');
    // overrideToken uses property-level ui:field
    expect((ui.overrideToken as any)['ui:field']).toBe('CustomField');
  });

  it('does not set KeyValueField when ui:field exists via $ref', () => {
    const schema = {
      type: 'object',
      properties: { token: { $ref: '#/$defs/TokenRef' } },
      $defs: { TokenRef: { type: 'object', 'ui:field': 'ReferenceField' } },
    } as any;
    const ui = buildUiSchema(schema);
    expect((ui.token as any)['ui:field']).toBe('ReferenceField');
  });

  it('does not use KeyValueField when additionalProperties=false and properties exist', () => {
    const schema = {
      type: 'object',
      properties: {
        obj: { type: 'object', additionalProperties: false, properties: { a: { type: 'string' } } },
      },
    } as any;
    const ui = buildUiSchema(schema);
    expect(ui.obj).toBeUndefined(); // no KeyValueField applied
  });

  it('uses KeyValueField for pure map (only additionalProperties)', () => {
    const schema = {
      type: 'object',
      properties: {
        map1: { type: 'object', additionalProperties: true },
        map2: { type: 'object', additionalProperties: { type: 'string' } },
      },
    } as any;
    const ui = buildUiSchema(schema);
    expect((ui.map1 as any)['ui:field']).toBe('KeyValueField');
    expect((ui.map2 as any)['ui:field']).toBe('KeyValueField');
  });
});
