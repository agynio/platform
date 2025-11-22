import ComponentPreviewHeader from '../ComponentPreviewHeader';
import { Panel, PanelHeader, PanelBody } from '../Panel';
import { IconButton } from '../IconButton';
import { 
  Plus, 
  X, 
  Check, 
  Trash2, 
  Edit, 
  Settings, 
  Download, 
  Upload,
  ChevronLeft,
  ChevronRight,
  Heart,
  Star,
  Search,
  Menu,
  Play,
  Pause
} from 'lucide-react';

interface IconButtonShowcaseProps {
  onBack: () => void;
}

export default function IconButtonShowcase({ onBack }: IconButtonShowcaseProps) {
  return (
    <div className="min-h-screen bg-[var(--agyn-bg-light)] p-8">
      <ComponentPreviewHeader 
        title="IconButton Component"
        description="Icon-only buttons for common actions and controls"
        onBack={onBack}
      />

      <div className="space-y-8">
        {/* Variants */}
        <Panel>
          <PanelHeader>
            <h2>Variants</h2>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">
              Different visual styles for various contexts
            </p>
          </PanelHeader>
          <PanelBody>
            <div className="space-y-6">
              {/* Primary */}
              <div>
                <h3 className="text-sm mb-3 text-[var(--agyn-dark)]">Primary</h3>
                <div className="flex items-center gap-3">
                  <IconButton variant="primary" icon={<Plus />} />
                  <IconButton variant="primary" icon={<Check />} />
                  <IconButton variant="primary" icon={<Settings />} />
                  <IconButton variant="primary" icon={<Download />} />
                </div>
              </div>

              {/* Secondary */}
              <div>
                <h3 className="text-sm mb-3 text-[var(--agyn-dark)]">Secondary</h3>
                <div className="flex items-center gap-3">
                  <IconButton variant="secondary" icon={<Plus />} />
                  <IconButton variant="secondary" icon={<Check />} />
                  <IconButton variant="secondary" icon={<Settings />} />
                  <IconButton variant="secondary" icon={<Download />} />
                </div>
              </div>

              {/* Accent */}
              <div>
                <h3 className="text-sm mb-3 text-[var(--agyn-dark)]">Accent</h3>
                <div className="flex items-center gap-3">
                  <IconButton variant="accent" icon={<Plus />} />
                  <IconButton variant="accent" icon={<Check />} />
                  <IconButton variant="accent" icon={<Settings />} />
                  <IconButton variant="accent" icon={<Download />} />
                </div>
              </div>

              {/* Outline */}
              <div>
                <h3 className="text-sm mb-3 text-[var(--agyn-dark)]">Outline</h3>
                <div className="flex items-center gap-3">
                  <IconButton variant="outline" icon={<Plus />} />
                  <IconButton variant="outline" icon={<Check />} />
                  <IconButton variant="outline" icon={<Settings />} />
                  <IconButton variant="outline" icon={<Download />} />
                </div>
              </div>

              {/* Ghost (Default) */}
              <div>
                <h3 className="text-sm mb-3 text-[var(--agyn-dark)]">Ghost (Default)</h3>
                <div className="flex items-center gap-3">
                  <IconButton icon={<Plus />} />
                  <IconButton icon={<Check />} />
                  <IconButton icon={<Settings />} />
                  <IconButton icon={<Download />} />
                </div>
              </div>

              {/* Danger */}
              <div>
                <h3 className="text-sm mb-3 text-[var(--agyn-dark)]">Danger</h3>
                <div className="flex items-center gap-3">
                  <IconButton variant="danger" icon={<Trash2 />} />
                  <IconButton variant="danger" icon={<X />} />
                  <IconButton variant="danger" icon={<Trash2 />} />
                  <IconButton variant="danger" icon={<X />} />
                </div>
              </div>
            </div>
          </PanelBody>
        </Panel>

        {/* Sizes */}
        <Panel>
          <PanelHeader>
            <h2>Sizes</h2>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">
              Three sizes: small, medium (default), and large
            </p>
          </PanelHeader>
          <PanelBody>
            <div className="space-y-6">
              {/* Small */}
              <div>
                <h3 className="text-sm mb-3 text-[var(--agyn-dark)]">Small (32px)</h3>
                <div className="flex items-center gap-3">
                  <IconButton size="sm" variant="primary" icon={<Plus />} />
                  <IconButton size="sm" variant="secondary" icon={<Check />} />
                  <IconButton size="sm" variant="accent" icon={<Settings />} />
                  <IconButton size="sm" variant="outline" icon={<Download />} />
                  <IconButton size="sm" icon={<Edit />} />
                  <IconButton size="sm" variant="danger" icon={<Trash2 />} />
                </div>
              </div>

              {/* Medium */}
              <div>
                <h3 className="text-sm mb-3 text-[var(--agyn-dark)]">Medium (40px) - Default</h3>
                <div className="flex items-center gap-3">
                  <IconButton variant="primary" icon={<Plus />} />
                  <IconButton variant="secondary" icon={<Check />} />
                  <IconButton variant="accent" icon={<Settings />} />
                  <IconButton variant="outline" icon={<Download />} />
                  <IconButton icon={<Edit />} />
                  <IconButton variant="danger" icon={<Trash2 />} />
                </div>
              </div>

              {/* Large */}
              <div>
                <h3 className="text-sm mb-3 text-[var(--agyn-dark)]">Large (48px)</h3>
                <div className="flex items-center gap-3">
                  <IconButton size="lg" variant="primary" icon={<Plus />} />
                  <IconButton size="lg" variant="secondary" icon={<Check />} />
                  <IconButton size="lg" variant="accent" icon={<Settings />} />
                  <IconButton size="lg" variant="outline" icon={<Download />} />
                  <IconButton size="lg" icon={<Edit />} />
                  <IconButton size="lg" variant="danger" icon={<Trash2 />} />
                </div>
              </div>
            </div>
          </PanelBody>
        </Panel>

        {/* Rounded vs Square */}
        <Panel>
          <PanelHeader>
            <h2>Shape</h2>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">
              Square (default with 10px radius) or fully rounded
            </p>
          </PanelHeader>
          <PanelBody>
            <div className="space-y-6">
              {/* Square (Default) */}
              <div>
                <h3 className="text-sm mb-3 text-[var(--agyn-dark)]">Square (Default)</h3>
                <div className="flex items-center gap-3">
                  <IconButton variant="primary" icon={<Plus />} />
                  <IconButton variant="secondary" icon={<Check />} />
                  <IconButton variant="accent" icon={<Settings />} />
                  <IconButton variant="outline" icon={<Download />} />
                  <IconButton icon={<Edit />} />
                </div>
              </div>

              {/* Rounded */}
              <div>
                <h3 className="text-sm mb-3 text-[var(--agyn-dark)]">Rounded</h3>
                <div className="flex items-center gap-3">
                  <IconButton rounded variant="primary" icon={<Plus />} />
                  <IconButton rounded variant="secondary" icon={<Check />} />
                  <IconButton rounded variant="accent" icon={<Settings />} />
                  <IconButton rounded variant="outline" icon={<Download />} />
                  <IconButton rounded icon={<Edit />} />
                </div>
              </div>
            </div>
          </PanelBody>
        </Panel>

        {/* States */}
        <Panel>
          <PanelHeader>
            <h2>States</h2>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">
              Default, hover, and disabled states
            </p>
          </PanelHeader>
          <PanelBody>
            <div className="space-y-6">
              {/* Normal */}
              <div>
                <h3 className="text-sm mb-3 text-[var(--agyn-dark)]">Default State</h3>
                <div className="flex items-center gap-3">
                  <IconButton variant="primary" icon={<Plus />} />
                  <IconButton variant="secondary" icon={<Check />} />
                  <IconButton variant="accent" icon={<Settings />} />
                  <IconButton variant="outline" icon={<Download />} />
                  <IconButton icon={<Edit />} />
                  <IconButton variant="danger" icon={<Trash2 />} />
                </div>
              </div>

              {/* Disabled */}
              <div>
                <h3 className="text-sm mb-3 text-[var(--agyn-dark)]">Disabled State</h3>
                <div className="flex items-center gap-3">
                  <IconButton variant="primary" icon={<Plus />} disabled />
                  <IconButton variant="secondary" icon={<Check />} disabled />
                  <IconButton variant="accent" icon={<Settings />} disabled />
                  <IconButton variant="outline" icon={<Download />} disabled />
                  <IconButton icon={<Edit />} disabled />
                  <IconButton variant="danger" icon={<Trash2 />} disabled />
                </div>
              </div>
            </div>
          </PanelBody>
        </Panel>

        {/* Common Use Cases */}
        <Panel>
          <PanelHeader>
            <h2>Common Use Cases</h2>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">
              Practical examples of IconButton in action
            </p>
          </PanelHeader>
          <PanelBody>
            <div className="space-y-6">
              {/* Navigation */}
              <div>
                <h3 className="text-sm mb-3 text-[var(--agyn-dark)]">Navigation</h3>
                <div className="flex items-center gap-2">
                  <IconButton icon={<ChevronLeft />} title="Previous" />
                  <IconButton icon={<ChevronRight />} title="Next" />
                  <IconButton icon={<Menu />} title="Menu" />
                  <IconButton variant="primary" icon={<Search />} title="Search" />
                </div>
              </div>

              {/* Actions */}
              <div>
                <h3 className="text-sm mb-3 text-[var(--agyn-dark)]">Actions</h3>
                <div className="flex items-center gap-2">
                  <IconButton variant="primary" icon={<Plus />} title="Add new" />
                  <IconButton icon={<Edit />} title="Edit" />
                  <IconButton variant="danger" icon={<Trash2 />} title="Delete" />
                  <IconButton icon={<Download />} title="Download" />
                  <IconButton icon={<Upload />} title="Upload" />
                </div>
              </div>

              {/* Media Controls */}
              <div>
                <h3 className="text-sm mb-3 text-[var(--agyn-dark)]">Media Controls</h3>
                <div className="flex items-center gap-2">
                  <IconButton rounded variant="primary" icon={<Play />} title="Play" />
                  <IconButton rounded icon={<Pause />} title="Pause" />
                </div>
              </div>

              {/* Social/Favorites */}
              <div>
                <h3 className="text-sm mb-3 text-[var(--agyn-dark)]">Social/Favorites</h3>
                <div className="flex items-center gap-2">
                  <IconButton rounded icon={<Heart />} title="Like" />
                  <IconButton rounded icon={<Star />} title="Favorite" />
                </div>
              </div>

              {/* Close/Dismiss */}
              <div>
                <h3 className="text-sm mb-3 text-[var(--agyn-dark)]">Close/Dismiss</h3>
                <div className="flex items-center gap-2">
                  <IconButton size="sm" icon={<X />} title="Close" />
                  <IconButton icon={<X />} title="Close" />
                  <IconButton rounded icon={<X />} title="Close" />
                </div>
              </div>

              {/* Toolbar Example */}
              <div>
                <h3 className="text-sm mb-3 text-[var(--agyn-dark)]">Toolbar Example</h3>
                <div className="inline-flex items-center gap-1 p-2 bg-white border border-[var(--agyn-border-default)] rounded-[10px]">
                  <IconButton size="sm" icon={<Plus />} title="Add" />
                  <IconButton size="sm" icon={<Edit />} title="Edit" />
                  <IconButton size="sm" icon={<Trash2 />} title="Delete" />
                  <div className="w-px h-6 bg-[var(--agyn-border-default)] mx-1" />
                  <IconButton size="sm" icon={<Download />} title="Download" />
                  <IconButton size="sm" icon={<Upload />} title="Upload" />
                  <div className="w-px h-6 bg-[var(--agyn-border-default)] mx-1" />
                  <IconButton size="sm" icon={<Settings />} title="Settings" />
                </div>
              </div>
            </div>
          </PanelBody>
        </Panel>

        {/* Code Example */}
        <Panel>
          <PanelHeader>
            <h2>Code Example</h2>
          </PanelHeader>
          <PanelBody>
            <pre className="bg-[var(--agyn-bg-light)] p-4 rounded-[10px] overflow-x-auto text-sm">
              <code>{`import { IconButton } from './components/IconButton';
import { Plus, Edit, Trash2, Settings } from 'lucide-react';

// Basic usage
<IconButton icon={<Plus />} />

// With variant
<IconButton variant="primary" icon={<Plus />} />

// With size
<IconButton size="lg" variant="primary" icon={<Plus />} />

// Rounded
<IconButton rounded variant="primary" icon={<Plus />} />

// Disabled
<IconButton variant="primary" icon={<Plus />} disabled />

// With click handler
<IconButton 
  variant="danger" 
  icon={<Trash2 />} 
  onClick={() => handleDelete()}
  title="Delete item"
/>

// All variants
<IconButton variant="primary" icon={<Plus />} />
<IconButton variant="secondary" icon={<Edit />} />
<IconButton variant="accent" icon={<Settings />} />
<IconButton variant="outline" icon={<Plus />} />
<IconButton variant="ghost" icon={<Edit />} />
<IconButton variant="danger" icon={<Trash2 />} />`}</code>
            </pre>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
