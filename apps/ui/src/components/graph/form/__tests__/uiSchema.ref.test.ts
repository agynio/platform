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
});
