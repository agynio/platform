import { ArrowLeft, Search, Mail, Lock, Calendar, Phone, Link as LinkIcon } from 'lucide-react';
import { Panel, PanelHeader, PanelBody } from '../Panel';
import { Input } from '../Input';
import { Textarea } from '../Textarea';
import ComponentPreviewHeader from '../ComponentPreviewHeader';

interface InputShowcaseProps {
  onBack: () => void;
}

export default function InputShowcase({ onBack }: InputShowcaseProps) {
  return (
    <div>
      <ComponentPreviewHeader
        title="Input"
        description="Text input fields with icons and validation states"
        onBack={onBack}
      />

      <div className="space-y-6">
        {/* Basic Input */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Basic Input</h3>
          </PanelHeader>
          <PanelBody>
            <div className="space-y-4 max-w-md">
              <Input placeholder="Enter text..." />
              <Input label="Email Address" placeholder="you@example.com" />
              <Input 
                label="Password" 
                type="password" 
                placeholder="Enter password" 
              />
            </div>
          </PanelBody>
        </Panel>

        {/* Sizes */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Sizes</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">Input field size variants</p>
          </PanelHeader>
          <PanelBody>
            <div className="space-y-4 max-w-md">
              <div>
                <h4 className="text-sm mb-3">Default Size</h4>
                <Input label="Full Name" placeholder="Enter your name" />
              </div>
              <div>
                <h4 className="text-sm mb-3">Small Size</h4>
                <Input 
                  label="Compact Input" 
                  placeholder="Smaller input field"
                  size="sm"
                />
              </div>
            </div>
          </PanelBody>
        </Panel>

        {/* Input Types */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Input Types</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">Various HTML5 input types</p>
          </PanelHeader>
          <PanelBody>
            <div className="space-y-4 max-w-md">
              <Input 
                label="Text" 
                type="text"
                placeholder="Enter text..."
              />
              <Input 
                label="Email" 
                type="email"
                placeholder="you@example.com"
              />
              <Input 
                label="Password" 
                type="password"
                placeholder="Enter password"
              />
              <Input 
                label="Number" 
                type="number"
                placeholder="Enter number"
                defaultValue="100"
                min="0"
                step="10"
              />
              <Input 
                label="Date" 
                type="date"
              />
              <Input 
                label="Time" 
                type="time"
              />
              <Input 
                label="Datetime Local" 
                type="datetime-local"
              />
              <Input 
                label="URL" 
                type="url"
                placeholder="https://example.com"
              />
              <Input 
                label="Tel" 
                type="tel"
                placeholder="+1 (555) 123-4567"
              />
              <Input 
                label="Search" 
                type="search"
                placeholder="Search..."
              />
              <Input 
                label="Color" 
                type="color"
                defaultValue="#3B82F6"
              />
            </div>
          </PanelBody>
        </Panel>

        {/* Textarea */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Textarea</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">Multiline text input fields</p>
          </PanelHeader>
          <PanelBody>
            <div className="space-y-4 max-w-md">
              <Textarea
                label="Description"
                placeholder="Enter a description..."
                rows={4}
              />
              <Textarea
                label="System Prompt"
                placeholder="You are a helpful assistant..."
                rows={6}
                helperText="Define the behavior and personality of the agent"
              />
              <Textarea
                label="Error Message"
                placeholder="Enter error message..."
                rows={3}
                error="This field is required"
              />
              <Textarea
                label="Small Textarea"
                placeholder="Compact multiline field..."
                rows={3}
                size="sm"
              />
            </div>
          </PanelBody>
        </Panel>

        {/* With Icons */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>With Icons</h3>
          </PanelHeader>
          <PanelBody>
            <div className="space-y-4 max-w-md">
              <Input 
                label="Email" 
                placeholder="you@example.com"
                leftIcon={<Mail className="w-5 h-5" />}
              />
              <Input 
                label="Search" 
                placeholder="Search..."
                leftIcon={<Search className="w-5 h-5" />}
              />
              <Input 
                label="Password" 
                type="password"
                placeholder="Enter password"
                leftIcon={<Lock className="w-5 h-5" />}
              />
              <Input 
                label="Date" 
                type="date"
                placeholder="Select date"
                leftIcon={<Calendar className="w-5 h-5" />}
              />
              <Input 
                label="Phone" 
                type="tel"
                placeholder="Enter phone number"
                leftIcon={<Phone className="w-5 h-5" />}
              />
              <Input 
                label="Link" 
                type="url"
                placeholder="Enter URL"
                leftIcon={<LinkIcon className="w-5 h-5" />}
              />
            </div>
          </PanelBody>
        </Panel>

        {/* Helper Text */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Helper Text</h3>
          </PanelHeader>
          <PanelBody>
            <div className="space-y-4 max-w-md">
              <Input 
                label="Username" 
                placeholder="Enter username"
                helperText="Choose a unique username for your account"
              />
              <Input 
                label="API Key" 
                placeholder="Enter API key"
                helperText="You can find your API key in the settings"
                leftIcon={<Lock className="w-5 h-5" />}
              />
            </div>
          </PanelBody>
        </Panel>

        {/* Error State */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Error State</h3>
          </PanelHeader>
          <PanelBody>
            <div className="space-y-4 max-w-md">
              <Input 
                label="Email" 
                placeholder="you@example.com"
                error="Please enter a valid email address"
                leftIcon={<Mail className="w-5 h-5" />}
              />
              <Input 
                label="Password" 
                type="password"
                placeholder="Enter password"
                error="Password must be at least 8 characters"
                leftIcon={<Lock className="w-5 h-5" />}
              />
            </div>
          </PanelBody>
        </Panel>

        {/* Disabled State */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Disabled State</h3>
          </PanelHeader>
          <PanelBody>
            <div className="space-y-4 max-w-md">
              <Input 
                label="Disabled Input" 
                placeholder="Cannot edit"
                disabled
              />
              <Input 
                label="Disabled with Value" 
                value="Readonly value"
                disabled
                leftIcon={<Lock className="w-5 h-5" />}
              />
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
              <code>{`import { Input } from './components/Input';
import { Textarea } from './components/Textarea';
import { Mail } from 'lucide-react';

// Input with icon
<Input 
  label="Email Address"
  placeholder="you@example.com"
  helperText="We'll never share your email"
  leftIcon={<Mail className="w-5 h-5" />}
/>

// Small size input
<Input 
  label="Compact Field"
  placeholder="Small input"
  size="sm"
/>

// Textarea
<Textarea
  label="Description"
  placeholder="Enter description..."
  rows={4}
  helperText="Provide details"
/>

// Error state
<Input 
  label="Password"
  type="password"
  error="Password is required"
/>`}</code>
            </pre>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}