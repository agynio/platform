import { useState } from 'react';
import { Grid, List, Calendar, AlignLeft, AlignCenter, AlignRight, Eye, Code, SplitSquareVertical } from 'lucide-react';
import { Panel, PanelHeader, PanelBody } from '../Panel';
import { SegmentedControl } from '../SegmentedControl';
import ComponentPreviewHeader from '../ComponentPreviewHeader';

interface SegmentedControlShowcaseProps {
  onBack: () => void;
}

export default function SegmentedControlShowcase({ onBack }: SegmentedControlShowcaseProps) {
  const [viewMode, setViewMode] = useState('grid');
  const [alignment, setAlignment] = useState('left');
  const [editorMode, setEditorMode] = useState('split');

  return (
    <div>
      <ComponentPreviewHeader
        title="Segmented Control"
        description="Compact control for selecting between mutually exclusive options"
        onBack={onBack}
      />

      <div className="space-y-6">
        {/* Basic Usage */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Basic Usage</h3>
          </PanelHeader>
          <PanelBody>
            <div className="space-y-6">
              <div>
                <p className="text-sm text-[var(--agyn-gray)] mb-3">View mode selector</p>
                <SegmentedControl
                  items={[
                    { value: 'grid', label: 'Grid', icon: <Grid className="w-4 h-4" /> },
                    { value: 'list', label: 'List', icon: <List className="w-4 h-4" /> },
                    { value: 'calendar', label: 'Calendar', icon: <Calendar className="w-4 h-4" /> },
                  ]}
                  value={viewMode}
                  onChange={setViewMode}
                />
                <p className="text-sm text-[var(--agyn-gray)] mt-2">Selected: {viewMode}</p>
              </div>

              <div>
                <p className="text-sm text-[var(--agyn-gray)] mb-3">Text alignment selector</p>
                <SegmentedControl
                  items={[
                    { value: 'left', label: 'Left', icon: <AlignLeft className="w-4 h-4" /> },
                    { value: 'center', label: 'Center', icon: <AlignCenter className="w-4 h-4" /> },
                    { value: 'right', label: 'Right', icon: <AlignRight className="w-4 h-4" /> },
                  ]}
                  value={alignment}
                  onChange={setAlignment}
                />
                <p className="text-sm text-[var(--agyn-gray)] mt-2">Selected: {alignment}</p>
              </div>
            </div>
          </PanelBody>
        </Panel>

        {/* Editor Mode Example */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Editor Mode (as used in MarkdownInput)</h3>
          </PanelHeader>
          <PanelBody>
            <div>
              <p className="text-sm text-[var(--agyn-gray)] mb-3">This is the actual component used in the fullscreen markdown editor</p>
              <SegmentedControl
                items={[
                  { value: 'edit', label: 'Edit', icon: <Code className="w-4 h-4" />, title: 'Edit Only' },
                  { value: 'split', label: 'Split', icon: <SplitSquareVertical className="w-4 h-4" />, title: 'Split View' },
                  { value: 'preview', label: 'Preview', icon: <Eye className="w-4 h-4" />, title: 'Preview Only' },
                ]}
                value={editorMode}
                onChange={setEditorMode}
              />
              <p className="text-sm text-[var(--agyn-gray)] mt-2">Selected: {editorMode}</p>
            </div>
          </PanelBody>
        </Panel>

        {/* Sizes */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Sizes</h3>
          </PanelHeader>
          <PanelBody>
            <div className="space-y-6">
              <div>
                <p className="text-sm text-[var(--agyn-gray)] mb-3">Small</p>
                <SegmentedControl
                  items={[
                    { value: 'grid', label: 'Grid', icon: <Grid className="w-4 h-4" /> },
                    { value: 'list', label: 'List', icon: <List className="w-4 h-4" /> },
                    { value: 'calendar', label: 'Calendar', icon: <Calendar className="w-4 h-4" /> },
                  ]}
                  value="grid"
                  onChange={() => {}}
                  size="sm"
                />
              </div>

              <div>
                <p className="text-sm text-[var(--agyn-gray)] mb-3">Medium (Default)</p>
                <SegmentedControl
                  items={[
                    { value: 'grid', label: 'Grid', icon: <Grid className="w-4 h-4" /> },
                    { value: 'list', label: 'List', icon: <List className="w-4 h-4" /> },
                    { value: 'calendar', label: 'Calendar', icon: <Calendar className="w-4 h-4" /> },
                  ]}
                  value="list"
                  onChange={() => {}}
                  size="md"
                />
              </div>
            </div>
          </PanelBody>
        </Panel>

        {/* Icon Only */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Icon Only</h3>
          </PanelHeader>
          <PanelBody>
            <div>
              <p className="text-sm text-[var(--agyn-gray)] mb-3">Compact icon-only variant</p>
              <SegmentedControl
                items={[
                  { value: 'left', label: <AlignLeft className="w-4 h-4" />, title: 'Align Left' },
                  { value: 'center', label: <AlignCenter className="w-4 h-4" />, title: 'Align Center' },
                  { value: 'right', label: <AlignRight className="w-4 h-4" />, title: 'Align Right' },
                ]}
                value="left"
                onChange={() => {}}
              />
            </div>
          </PanelBody>
        </Panel>

        {/* Text Only */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Text Only</h3>
          </PanelHeader>
          <PanelBody>
            <div>
              <p className="text-sm text-[var(--agyn-gray)] mb-3">Without icons</p>
              <SegmentedControl
                items={[
                  { value: 'day', label: 'Day' },
                  { value: 'week', label: 'Week' },
                  { value: 'month', label: 'Month' },
                  { value: 'year', label: 'Year' },
                ]}
                value="week"
                onChange={() => {}}
              />
            </div>
          </PanelBody>
        </Panel>

        {/* States */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>States</h3>
          </PanelHeader>
          <PanelBody>
            <div className="space-y-6">
              <div>
                <p className="text-sm text-[var(--agyn-gray)] mb-3">Normal</p>
                <SegmentedControl
                  items={[
                    { value: 'option1', label: 'Option 1' },
                    { value: 'option2', label: 'Option 2' },
                    { value: 'option3', label: 'Option 3' },
                  ]}
                  value="option1"
                  onChange={() => {}}
                />
              </div>

              <div>
                <p className="text-sm text-[var(--agyn-gray)] mb-3">With disabled option</p>
                <SegmentedControl
                  items={[
                    { value: 'option1', label: 'Option 1' },
                    { value: 'option2', label: 'Option 2', disabled: true },
                    { value: 'option3', label: 'Option 3' },
                  ]}
                  value="option1"
                  onChange={() => {}}
                />
              </div>
            </div>
          </PanelBody>
        </Panel>

        {/* Code Example */}
        <Panel variant="subtle">
          <PanelHeader>
            <h4>Usage Example</h4>
          </PanelHeader>
          <PanelBody>
            <pre className="bg-[var(--agyn-dark)] text-white p-4 rounded-[6px] overflow-x-auto text-sm">
              <code>{`import { SegmentedControl } from './components/SegmentedControl';
import { Grid, List, Calendar } from 'lucide-react';

const [viewMode, setViewMode] = useState('grid');

<SegmentedControl
  items={[
    { value: 'grid', label: 'Grid', icon: <Grid className="w-4 h-4" /> },
    { value: 'list', label: 'List', icon: <List className="w-4 h-4" /> },
    { value: 'calendar', label: 'Calendar', icon: <Calendar className="w-4 h-4" /> },
  ]}
  value={viewMode}
  onChange={setViewMode}
  size="md"
/>`}</code>
            </pre>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
