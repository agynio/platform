import ManageToolConfigScreen from '../screens/ManageToolConfigScreen';
import type { StaticConfigViewProps } from './types';

export default function ManageToolConfigView({ templateName: _template, ...rest }: StaticConfigViewProps) {
  return <ManageToolConfigScreen {...rest} />;
}
