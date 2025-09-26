// Central field registry so that form wrappers can import without causing fast-refresh warnings.
import { KeyValueField } from './keyValueField';

export { KeyValueField };
export const fieldsRegistry = { KeyValueField } as Record<string, unknown>;
