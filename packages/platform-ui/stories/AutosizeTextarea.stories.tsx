import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Send } from 'lucide-react';
import { AutosizeTextarea } from '../src/components/AutosizeTextarea';
import { IconButton } from '../src/components/IconButton';
import { Panel, PanelBody, PanelHeader } from '../src/components/Panel';

const meta: Meta<typeof AutosizeTextarea> = {
  title: 'Components/AutosizeTextarea',
  component: AutosizeTextarea,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof AutosizeTextarea>;

export const BasicExamples: Story = {
  render: () => {
    const [value1, setValue1] = useState('');
    const [value2, setValue2] = useState('');
    const [singleLine, setSingleLine] = useState('');

    return (
      <Panel variant="elevated">
        <PanelHeader>
          <h3>Basic Autosize</h3>
        </PanelHeader>
        <PanelBody>
          <p className="text-sm text-[var(--agyn-gray)] mb-4">
            Default autosize textarea that grows as you type
          </p>
          <div className="space-y-4">
            <AutosizeTextarea
              placeholder="Type here and watch it grow..."
              value={value1}
              onChange={(e) => setValue1(e.target.value)}
            />
            <AutosizeTextarea
              placeholder="Small size variant"
              size="sm"
              value={value2}
              onChange={(e) => setValue2(e.target.value)}
            />
            <AutosizeTextarea
              placeholder="Single line (minLines=1)"
              size="sm"
              value={singleLine}
              onChange={(e) => setSingleLine(e.target.value)}
              minLines={1}
              maxLines={8}
            />
          </div>
        </PanelBody>
      </Panel>
    );
  },
};

export const MinMaxLines: Story = {
  render: () => {
    const [value3, setValue3] = useState(
      'This is a pre-filled autosize textarea.\n\nIt already has multiple lines of content to demonstrate how it adjusts to existing text.',
    );
    const [value4, setValue4] = useState('');

    return (
      <Panel variant="elevated">
        <PanelHeader>
          <h3>Min &amp; Max Lines</h3>
        </PanelHeader>
        <PanelBody>
          <p className="text-sm text-[var(--agyn-gray)] mb-4">
            Control the minimum and maximum number of lines
          </p>
          <div className="space-y-4">
            <AutosizeTextarea
              placeholder="Min 3 lines, no max (try adding multiple lines)"
              minLines={3}
              value={value3}
              onChange={(e) => setValue3(e.target.value)}
            />
            <AutosizeTextarea
              placeholder="Min 2 lines, max 5 lines (will scroll after 5 lines)"
              minLines={2}
              maxLines={5}
              value={value4}
              onChange={(e) => setValue4(e.target.value)}
            />
          </div>
        </PanelBody>
      </Panel>
    );
  },
};

export const WithLabelsAndHelper: Story = {
  render: () => {
    const [value5, setValue5] = useState('');

    return (
      <Panel variant="elevated">
        <PanelHeader>
          <h3>With Labels &amp; Helper Text</h3>
        </PanelHeader>
        <PanelBody>
          <p className="text-sm text-[var(--agyn-gray)] mb-4">
            Autosize textarea with labels, helper text, and validation
          </p>
          <div className="space-y-4">
            <AutosizeTextarea
              label="Description"
              placeholder="Enter a description..."
              helperText="This field will automatically expand as you type"
              minLines={2}
              maxLines={8}
              value={value5}
              onChange={(e) => setValue5(e.target.value)}
            />
            <AutosizeTextarea
              label="Feedback"
              placeholder="Share your thoughts..."
              error="This field is required"
              minLines={3}
            />
          </div>
        </PanelBody>
      </Panel>
    );
  },
};

export const States: Story = {
  render: () => {
    return (
      <Panel variant="elevated">
        <PanelHeader>
          <h3>States</h3>
        </PanelHeader>
        <PanelBody>
          <p className="text-sm text-[var(--agyn-gray)] mb-4">
            Different states of the autosize textarea
          </p>
          <div className="space-y-4">
            <AutosizeTextarea placeholder="Default state" minLines={2} />
            <AutosizeTextarea
              placeholder="Disabled state"
              disabled
              value="This textarea is disabled"
              minLines={2}
            />
            <AutosizeTextarea
              placeholder="Error state"
              error="Please provide valid input"
              minLines={2}
            />
          </div>
        </PanelBody>
      </Panel>
    );
  },
};

export const ChatInput: Story = {
  render: () => {
    const [chatValue, setChatValue] = useState('');

    const handleSend = () => {
      if (chatValue.trim()) {
        console.log('Sending message:', chatValue);
        setChatValue('');
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    };

    return (
      <Panel variant="elevated">
        <PanelHeader>
          <h3>Chat Input with Trailing Icon Button</h3>
        </PanelHeader>
        <PanelBody>
          <p className="text-sm text-[var(--agyn-gray)] mb-4">
            Chat-style input with integrated send button (Press Enter to send, Shift+Enter for new line)
          </p>
          <div className="relative">
            <AutosizeTextarea
              placeholder="Type a message..."
              value={chatValue}
              onChange={(e) => setChatValue(e.target.value)}
              onKeyDown={handleKeyDown}
              minLines={1}
              maxLines={8}
              size="sm"
              className="pr-12"
            />
            <div className="absolute bottom-[11px] right-[5px]">
              <IconButton
                icon={<Send className="w-4 h-4" />}
                onClick={handleSend}
                disabled={!chatValue.trim()}
                variant="primary"
                size="sm"
              />
            </div>
          </div>
        </PanelBody>
      </Panel>
    );
  },
};

export const SimpleChatInput: Story = {
  render: () => {
    const [simpleChat, setSimpleChat] = useState('');

    const handleSend = () => {
      if (simpleChat.trim()) {
        console.log('Sending message:', simpleChat);
        setSimpleChat('');
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    };

    return (
      <Panel variant="elevated">
        <PanelHeader>
          <h3>Simple Chat Input with Trailing Icon Button</h3>
        </PanelHeader>
        <PanelBody>
          <p className="text-sm text-[var(--agyn-gray)] mb-4">
            Simple chat-style input with integrated send button (Press Enter to send, Shift+Enter for new line)
          </p>
          <div className="relative">
            <AutosizeTextarea
              placeholder="Type a message..."
              value={simpleChat}
              onChange={(e) => setSimpleChat(e.target.value)}
              onKeyDown={handleKeyDown}
              minLines={1}
              maxLines={8}
              size="sm"
              className="pr-12"
            />
            <div className="absolute bottom-[11px] right-[5px]">
              <IconButton
                icon={<Send className="w-4 h-4" />}
                onClick={handleSend}
                disabled={!simpleChat.trim()}
                variant="primary"
                size="sm"
              />
            </div>
          </div>
        </PanelBody>
      </Panel>
    );
  },
};

const codeSample = `import { AutosizeTextarea } from './components/AutosizeTextarea';
import { IconButton } from './components/IconButton';
import { Send } from 'lucide-react';

function ChatInput() {
  const [message, setMessage] = useState('');

  const handleSend = () => {
    if (message.trim()) {
      console.log('Sending:', message);
      setMessage('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="relative">
      <AutosizeTextarea
        placeholder="Type a message..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        minLines={1}
        maxLines={8}
        size="sm"
        className="pr-12"
      />
      <div className="absolute bottom-2 right-2">
        <IconButton
          icon={<Send className="w-4 h-4" />}
          onClick={handleSend}
          disabled={!message.trim()}
          variant="primary"
          size="sm"
        />
      </div>
    </div>
  );
}`;

export const CodeExample: Story = {
  render: () => {
    return (
      <Panel variant="subtle">
        <PanelHeader>
          <h4>Usage Example</h4>
        </PanelHeader>
        <PanelBody>
          <pre className="bg-[var(--agyn-dark)] text-white p-4 rounded-[6px] overflow-x-auto text-sm">
            <code>{codeSample}</code>
          </pre>
        </PanelBody>
      </Panel>
    );
  },
};

export const Props: Story = {
  render: () => {
    return (
      <Panel variant="subtle">
        <PanelHeader>
          <h4>Props</h4>
        </PanelHeader>
        <PanelBody>
          <div className="space-y-3 text-sm">
            <div>
              <code className="bg-[var(--agyn-bg-light)] px-2 py-1 rounded">label</code>
              <span className="text-[var(--agyn-gray)] ml-2">- Optional label text</span>
            </div>
            <div>
              <code className="bg-[var(--agyn-bg-light)] px-2 py-1 rounded">placeholder</code>
              <span className="text-[var(--agyn-gray)] ml-2">- Placeholder text</span>
            </div>
            <div>
              <code className="bg-[var(--agyn-bg-light)] px-2 py-1 rounded">value</code>
              <span className="text-[var(--agyn-gray)] ml-2">- Controlled value</span>
            </div>
            <div>
              <code className="bg-[var(--agyn-bg-light)] px-2 py-1 rounded">onChange</code>
              <span className="text-[var(--agyn-gray)] ml-2">- Change handler</span>
            </div>
            <div>
              <code className="bg-[var(--agyn-bg-light)] px-2 py-1 rounded">size</code>
              <span className="text-[var(--agyn-gray)] ml-2">- 'sm' | 'default' (default: 'default')</span>
            </div>
            <div>
              <code className="bg-[var(--agyn-bg-light)] px-2 py-1 rounded">minLines</code>
              <span className="text-[var(--agyn-gray)] ml-2">- Minimum number of lines (default: 1)</span>
            </div>
            <div>
              <code className="bg-[var(--agyn-bg-light)] px-2 py-1 rounded">maxLines</code>
              <span className="text-[var(--agyn-gray)] ml-2">- Maximum number of lines before scrolling</span>
            </div>
            <div>
              <code className="bg-[var(--agyn-bg-light)] px-2 py-1 rounded">error</code>
              <span className="text-[var(--agyn-gray)] ml-2">- Error message to display</span>
            </div>
            <div>
              <code className="bg-[var(--agyn-bg-light)] px-2 py-1 rounded">helperText</code>
              <span className="text-[var(--agyn-gray)] ml-2">- Helper text below the textarea</span>
            </div>
            <div>
              <code className="bg-[var(--agyn-bg-light)] px-2 py-1 rounded">disabled</code>
              <span className="text-[var(--agyn-gray)] ml-2">- Disables the textarea</span>
            </div>
          </div>
        </PanelBody>
      </Panel>
    );
  },
};
