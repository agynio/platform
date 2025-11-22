import { useState } from 'react';
import TypographyShowcase from './components/showcase/TypographyShowcase';
import ButtonShowcase from './components/showcase/ButtonShowcase';
import IconButtonShowcase from './components/showcase/IconButtonShowcase';
import InputShowcase from './components/showcase/InputShowcase';
import PanelShowcase from './components/showcase/PanelShowcase';
import LogoShowcase from './components/showcase/LogoShowcase';
import PaletteShowcase from './components/showcase/PaletteShowcase';
import SidebarShowcase from './components/showcase/SidebarShowcase';
import NodeShowcase from './components/showcase/NodeShowcase';
import BadgeShowcase from './components/showcase/BadgeShowcase';
import NodePropertiesSidebarShowcase from './components/showcase/NodePropertiesSidebarShowcase';
import DropdownShowcase from './components/showcase/DropdownShowcase';
import ToggleShowcase from './components/showcase/ToggleShowcase';
import MarkdownInputShowcase from './components/showcase/MarkdownInputShowcase';
import ReferenceInputShowcase from './components/showcase/ReferenceInputShowcase';
import BashInputShowcase from './components/showcase/BashInputShowcase';
import AutocompleteInputShowcase from './components/showcase/AutocompleteInputShowcase';
import SegmentedControlShowcase from './components/showcase/SegmentedControlShowcase';
import ConversationShowcase from './components/showcase/ConversationShowcase';
import AutosizeTextareaShowcase from './components/showcase/AutosizeTextareaShowcase';
import ThreadsListShowcase from './components/showcase/ThreadsListShowcase';
import StatusIndicatorShowcase from './components/showcase/StatusIndicatorShowcase';
import RunEventDetailsShowcase from './components/showcase/RunEventDetailsShowcase';
import { RunEventsListShowcase } from './components/showcase/RunEventsListShowcase';
import { VirtualizedListShowcase } from './components/showcase/VirtualizedListShowcase';
import ThreadsScreen from './components/screens/ThreadsScreen';
import RunScreenShowcase from './components/showcase/RunScreenShowcase';
import RemindersScreenShowcase from './components/showcase/RemindersScreenShowcase';
import ContainersScreenShowcase from './components/showcase/ContainersScreenShowcase';
import VariablesScreenShowcase from './components/showcase/VariablesScreenShowcase';
import SecretsScreenShowcase from './components/showcase/SecretsScreenShowcase';
import GraphScreenShowcase from './components/showcase/GraphScreenShowcase';
import { TooltipProvider } from './components/ui/tooltip';

type ComponentPage = 'home' | 'typography' | 'logo' | 'palette' | 'button' | 'iconButton' | 'input' | 'panel' | 'sidebar' | 'node' | 'badge' | 'nodePropertiesSidebar' | 'dropdown' | 'toggle' | 'segmentedControl' | 'conversation' | 'markdownInput' | 'referenceInput' | 'bashInput' | 'autocompleteInput' | 'autosizeTextarea' | 'threadsList' | 'statusIndicator' | 'runEventDetails' | 'runEventsList' | 'virtualizedList' | 'threadsScreen' | 'runScreen' | 'remindersScreen' | 'containersScreen' | 'variablesScreen' | 'secretsScreen' | 'graphScreen';

export default function App() {
  const [currentPage, setCurrentPage] = useState<ComponentPage>('home');
  const [selectedMenuItem, setSelectedMenuItem] = useState<string>('graph');

  // Map menu items to screens
  const menuItemToScreen: Record<string, ComponentPage> = {
    'graph': 'graphScreen',
    'threads': 'threadsScreen',
    'reminders': 'remindersScreen',
    'containers': 'containersScreen',
    'resources': 'containersScreen', // Default to containers for now
    'secrets': 'secretsScreen',
    'variables': 'variablesScreen',
  };

  const handleMenuItemSelect = (itemId: string) => {
    setSelectedMenuItem(itemId);
    const screenId = menuItemToScreen[itemId];
    if (screenId) {
      setCurrentPage(screenId);
    }
  };

  const components = [
    { id: 'typography' as const, name: 'Typography', description: 'Headings, body text, and text styles' },
    { id: 'logo' as const, name: 'Logo', description: 'Brand wordmark variations' },
    { id: 'palette' as const, name: 'Palette', description: 'Brand colors and gradients' },
    { id: 'button' as const, name: 'Button', description: 'Primary, secondary, and accent buttons' },
    { id: 'iconButton' as const, name: 'Icon Button', description: 'Buttons with icons' },
    { id: 'input' as const, name: 'Input Field', description: 'Text inputs and form controls' },
    { id: 'referenceInput' as const, name: 'Reference Input', description: 'Input with built-in source selector' },
    { id: 'dropdown' as const, name: 'Dropdown', description: 'Select inputs with options' },
    { id: 'toggle' as const, name: 'Toggle', description: 'Switch controls for binary states' },
    { id: 'segmentedControl' as const, name: 'Segmented Control', description: 'Multi-option selection control' },
    { id: 'conversation' as const, name: 'Conversation', description: 'Chat interface for user interactions' },
    { id: 'panel' as const, name: 'Panel', description: 'Cards and surface containers' },
    { id: 'sidebar' as const, name: 'Sidebar', description: 'Navigation menu with collapsible sections' },
    { id: 'node' as const, name: 'Node', description: 'Visual nodes for graph-based workflows' },
    { id: 'badge' as const, name: 'Badge', description: 'Status indicators and labels' },
    { id: 'nodePropertiesSidebar' as const, name: 'Node Properties Sidebar', description: 'Configuration sidebar for nodes' },
    { id: 'markdownInput' as const, name: 'Markdown Input', description: 'Markdown editor for rich text' },
    { id: 'bashInput' as const, name: 'Bash Input', description: 'Bash command input field' },
    { id: 'autocompleteInput' as const, name: 'Autocomplete Input', description: 'Input with suggestions' },
    { id: 'autosizeTextarea' as const, name: 'Autosize Textarea', description: 'Textarea that resizes with content' },
    { id: 'threadsList' as const, name: 'Threads List', description: 'List of threads for organization' },
    { id: 'statusIndicator' as const, name: 'Status Indicator', description: 'Visual status indicators' },
    { id: 'runEventDetails' as const, name: 'Run Events', description: 'Event timeline and detailed views' },
    { id: 'runEventsList' as const, name: 'Run Events List', description: 'Virtuoso-based infinite scroll event list' },
    { id: 'virtualizedList' as const, name: 'Virtualized List', description: 'Reusable virtualized list component' },
  ];

  const screens = [
    { id: 'threadsScreen' as const, name: 'Threads Screen', description: 'Full screen thread management' },
    { id: 'runScreen' as const, name: 'Run Screen', description: 'Full screen run monitoring and event tracking' },
    { id: 'remindersScreen' as const, name: 'Reminders Screen', description: 'Manage scheduled and executed reminders' },
    { id: 'containersScreen' as const, name: 'Containers Screen', description: 'Manage Docker containers and sidecars' },
    { id: 'variablesScreen' as const, name: 'Variables Screen', description: 'Manage graph and local variables' },
    { id: 'secretsScreen' as const, name: 'Secrets Screen', description: 'Manage secure credentials and API keys' },
    { id: 'graphScreen' as const, name: 'Graph Screen', description: 'Visual graph editor with node canvas' },
  ];

  const renderContent = () => {
    switch (currentPage) {
      case 'typography':
        return <TypographyShowcase onBack={() => setCurrentPage('home')} />;
      case 'logo':
        return <LogoShowcase onBack={() => setCurrentPage('home')} />;
      case 'palette':
        return <PaletteShowcase onBack={() => setCurrentPage('home')} />;
      case 'button':
        return <ButtonShowcase onBack={() => setCurrentPage('home')} />;
      case 'iconButton':
        return <IconButtonShowcase onBack={() => setCurrentPage('home')} />;
      case 'input':
        return <InputShowcase onBack={() => setCurrentPage('home')} />;
      case 'referenceInput':
        return <ReferenceInputShowcase onBack={() => setCurrentPage('home')} />;
      case 'dropdown':
        return <DropdownShowcase onBack={() => setCurrentPage('home')} />;
      case 'toggle':
        return <ToggleShowcase onBack={() => setCurrentPage('home')} />;
      case 'segmentedControl':
        return <SegmentedControlShowcase onBack={() => setCurrentPage('home')} />;
      case 'conversation':
        return <ConversationShowcase onBack={() => setCurrentPage('home')} />;
      case 'panel':
        return <PanelShowcase onBack={() => setCurrentPage('home')} />;
      case 'sidebar':
        return <SidebarShowcase onBack={() => setCurrentPage('home')} />;
      case 'node':
        return <NodeShowcase onBack={() => setCurrentPage('home')} />;
      case 'badge':
        return <BadgeShowcase onBack={() => setCurrentPage('home')} />;
      case 'nodePropertiesSidebar':
        return <NodePropertiesSidebarShowcase onBack={() => setCurrentPage('home')} />;
      case 'markdownInput':
        return <MarkdownInputShowcase onBack={() => setCurrentPage('home')} />;
      case 'bashInput':
        return <BashInputShowcase onBack={() => setCurrentPage('home')} />;
      case 'autocompleteInput':
        return <AutocompleteInputShowcase onBack={() => setCurrentPage('home')} />;
      case 'autosizeTextarea':
        return <AutosizeTextareaShowcase onBack={() => setCurrentPage('home')} />;
      case 'threadsList':
        return <ThreadsListShowcase onBack={() => setCurrentPage('home')} />;
      case 'statusIndicator':
        return <StatusIndicatorShowcase onBack={() => setCurrentPage('home')} />;
      case 'runEventDetails':
        return <RunEventDetailsShowcase onBack={() => setCurrentPage('home')} />;
      case 'runEventsList':
        return <RunEventsListShowcase onBack={() => setCurrentPage('home')} />;
      case 'virtualizedList':
        return <VirtualizedListShowcase onBack={() => setCurrentPage('home')} />;
      case 'threadsScreen':
        return <ThreadsScreen 
          onBack={() => setCurrentPage('home')} 
          selectedMenuItem={selectedMenuItem}
          onMenuItemSelect={handleMenuItemSelect}
        />;
      case 'runScreen':
        return <RunScreenShowcase onBack={() => setCurrentPage('home')} />;
      case 'remindersScreen':
        return <RemindersScreenShowcase 
          onBack={() => setCurrentPage('home')} 
          selectedMenuItem={selectedMenuItem}
          onMenuItemSelect={handleMenuItemSelect}
        />;
      case 'containersScreen':
        return <ContainersScreenShowcase 
          onBack={() => setCurrentPage('home')} 
          selectedMenuItem={selectedMenuItem}
          onMenuItemSelect={handleMenuItemSelect}
        />;
      case 'variablesScreen':
        return <VariablesScreenShowcase 
          onBack={() => setCurrentPage('home')} 
          selectedMenuItem={selectedMenuItem}
          onMenuItemSelect={handleMenuItemSelect}
        />;
      case 'secretsScreen':
        return <SecretsScreenShowcase 
          onBack={() => setCurrentPage('home')} 
          selectedMenuItem={selectedMenuItem}
          onMenuItemSelect={handleMenuItemSelect}
        />;
      case 'graphScreen':
        return <GraphScreenShowcase 
          onBack={() => setCurrentPage('home')} 
          selectedMenuItem={selectedMenuItem}
          onMenuItemSelect={handleMenuItemSelect}
        />;
      default:
        return (
          <div>
            <div className="mb-8">
              <h1 className="mb-2" style={{ 
                background: 'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}>
                agyn
              </h1>
              <p className="text-[var(--agyn-gray)]">Design System Components</p>
            </div>

            <div className="mb-8">
              <h2 className="mb-4">Components</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {components.map((component) => (
                  <button
                    key={component.id}
                    onClick={() => setCurrentPage(component.id)}
                    className="p-6 bg-white rounded-[10px] border border-[var(--agyn-border-subtle)] hover:border-[var(--agyn-blue)] transition-colors text-left"
                  >
                    <h3 className="mb-2">{component.name}</h3>
                    <p className="text-[var(--agyn-gray)]">{component.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-8">
              <h2 className="mb-4">Screens</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {screens.map((screen) => (
                  <button
                    key={screen.id}
                    onClick={() => setCurrentPage(screen.id)}
                    className="p-6 bg-white rounded-[10px] border border-[var(--agyn-border-subtle)] hover:border-[var(--agyn-blue)] transition-colors text-left"
                  >
                    <h3 className="mb-2">{screen.name}</h3>
                    <p className="text-[var(--agyn-gray)]">{screen.description}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <TooltipProvider>
      {currentPage === 'threadsScreen' || currentPage === 'runScreen' || currentPage === 'remindersScreen' || currentPage === 'containersScreen' || currentPage === 'variablesScreen' || currentPage === 'secretsScreen' || currentPage === 'graphScreen' || currentPage === 'runEventDetails' || currentPage === 'runEventsList' || currentPage === 'virtualizedList' ? (
        renderContent()
      ) : (
        <div className="min-h-screen bg-[var(--agyn-bg-light)] p-8">
          <div className="max-w-7xl mx-auto">
            {renderContent()}
          </div>
        </div>
      )}
    </TooltipProvider>
  );
}