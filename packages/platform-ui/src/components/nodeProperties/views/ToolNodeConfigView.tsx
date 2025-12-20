import type { NodePropertiesViewProps } from '../viewTypes';
import ToolNameField from './toolTemplates/ToolNameField';
import { useToolNameField } from './toolTemplates/useToolNameField';

export function ToolNodeConfigView(props: NodePropertiesViewProps<'Tool'>) {
  const nameField = useToolNameField(props);

  return <ToolNameField {...nameField} />;
}

export default ToolNodeConfigView;
