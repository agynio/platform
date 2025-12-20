import { Input } from '../../../Input';
import { FieldLabel } from '../../FieldLabel';
import { TOOL_NAME_HINT } from '../../toolNameHint';

interface ToolNameFieldProps {
  value: string;
  error: string | null;
  placeholder: string;
  onChange: (value: string) => void;
}

export function ToolNameField({ value, error, placeholder, onChange }: ToolNameFieldProps) {
  return (
    <section>
      <FieldLabel label="Name" hint={TOOL_NAME_HINT} />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        size="sm"
        aria-invalid={error ? 'true' : 'false'}
      />
      {error && <p className="mt-1 text-xs text-[var(--agyn-status-failed)]">{error}</p>}
    </section>
  );
}

export default ToolNameField;

