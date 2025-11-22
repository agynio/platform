import { VariablesScreen } from '@agyn/ui-new';

const placeholderVariables = [
  {
    id: 'placeholder',
    key: 'AGENT_TIMEOUT',
    graphValue: '30',
    localValue: '30',
  },
];

export function SettingsVariablesNew() {
  return <VariablesScreen variables={placeholderVariables} renderSidebar={false} />;
}
