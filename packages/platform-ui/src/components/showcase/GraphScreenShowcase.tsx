import GraphScreen from './screens/GraphScreen';

interface GraphScreenShowcaseProps {
  onBack?: () => void;
  selectedMenuItem?: string;
  onMenuItemSelect?: (itemId: string) => void;
}

export default function GraphScreenShowcase({ onBack, selectedMenuItem, onMenuItemSelect }: GraphScreenShowcaseProps) {
  return <GraphScreen 
    onBack={onBack} 
    selectedMenuItem={selectedMenuItem}
    onMenuItemSelect={onMenuItemSelect}
  />;
}
