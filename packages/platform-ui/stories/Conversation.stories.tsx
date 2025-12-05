import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Send } from 'lucide-react';
import { Conversation, type Run, type QueuedMessageData, type ReminderData } from '../src/components/Conversation';
import { type Status } from '../src/components/StatusIndicator';
import { AutosizeTextarea } from '../src/components/AutosizeTextarea';
import { IconButton } from '../src/components/IconButton';
import { Button } from '../src/components/Button';

const meta: Meta<typeof Conversation> = {
  title: 'Screens/Threads/Conversation',
  component: Conversation,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['!autodocs'],
};

export default meta;

type Story = StoryObj<typeof Conversation>;

const multiRunData: Run[] = [
  {
    id: 'run-001-abc-def',
    status: 'finished',
    duration: '2.3s',
    tokens: 1547,
    cost: '$0.023',
    messages: [
      {
        id: 'msg-1',
        role: 'user',
        content: 'Can you help me create a REST API endpoint for user authentication?',
        timestamp: '10:23 AM',
      },
      {
        id: 'msg-2',
        role: 'assistant',
        content:
          "I'll help you create a user authentication endpoint. Let me analyze the requirements and generate the code.",
        timestamp: '10:23 AM',
      },
      {
        id: 'msg-3',
        role: 'tool',
        content: 'Running code analysis... Found existing auth patterns in the codebase.',
        timestamp: '10:23 AM',
      },
    ],
  },
  {
    id: 'run-002-ghi-jkl',
    status: 'finished',
    duration: '5.1s',
    tokens: 3421,
    cost: '$0.051',
    messages: [
      {
        id: 'msg-4',
        role: 'assistant',
        content:
          "Here's a secure authentication endpoint implementation with JWT tokens:\n\napp.post('/api/auth/login', async (req, res) => { /* Implementation */ });",
        timestamp: '10:23 AM',
      },
      {
        id: 'msg-5',
        role: 'user',
        content: 'Can you add password hashing to this?',
        timestamp: '10:24 AM',
      },
      {
        id: 'msg-6',
        role: 'assistant',
        content: "Absolutely! I'll add bcrypt for secure password hashing.",
        timestamp: '10:24 AM',
      },
    ],
  },
  {
    id: 'run-003-mno-pqr',
    status: 'finished',
    duration: '3.7s',
    tokens: 856,
    cost: '$0.013',
    messages: [
      {
        id: 'msg-7',
        role: 'tool',
        content: 'Installing bcrypt package...',
        timestamp: '10:24 AM',
      },
      {
        id: 'msg-8',
        role: 'system',
        content: 'Package installation complete. Dependencies updated successfully.',
        timestamp: '10:24 AM',
      },
      {
        id: 'msg-9',
        role: 'assistant',
        content: 'Updated the authentication endpoint with bcrypt password hashing.',
        timestamp: '10:24 AM',
      },
    ],
  },
  {
    id: 'run-004-stu-vwx',
    status: 'finished',
    duration: '1.8s',
    tokens: 645,
    cost: '$0.010',
    messages: [
      {
        id: 'msg-10',
        role: 'user',
        content: 'Now add JWT token generation',
        timestamp: '10:25 AM',
      },
      {
        id: 'msg-11',
        role: 'assistant',
        content: 'I will add JWT token generation using the jsonwebtoken package.',
        timestamp: '10:25 AM',
      },
    ],
  },
];

const sampleQueued: QueuedMessageData[] = [
  {
    id: 'queued-1',
    content: 'Generate unit tests for the authentication endpoint',
  },
  {
    id: 'queued-2',
    content: 'Add rate limiting to prevent brute force attacks',
  },
];

const sampleReminders: ReminderData[] = [
  {
    id: 'reminder-1',
    content: 'Review and deploy authentication changes to staging',
    scheduledTime: '15:00',
    date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  },
];

export const Empty: Story = {
  render: () => (
    <div className="p-6 bg-[var(--agyn-bg-light)] min-h-screen flex items-center justify-center">
      <div className="w-full max-w-4xl h-[520px]">
        <Conversation
          runs={[]}
          header={
            <div className="flex items-center justify-between">
              <div>
                <h3>Conversation</h3>
                <p className="text-[var(--agyn-gray)]">No messages yet – select a thread to begin.</p>
              </div>
            </div>
          }
        />
      </div>
    </div>
  ),
};

export const FullExample: Story = {
  render: (args) => {
    const [inputValue, setInputValue] = useState('');

    const header = (
      <div className="flex items-center justify-between">
        <div>
          <h3>Conversation</h3>
          <p className="text-[var(--agyn-gray)]">Chat interface with runs, queued messages, and reminders</p>
        </div>
      </div>
    );

    const footer = (
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <AutosizeTextarea
            placeholder="Send a message to the agent..."
            minRows={1}
            maxRows={5}
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
          />
        </div>
        <IconButton aria-label="Send message" disabled={!inputValue.trim()}>
          <Send className="w-4 h-4" />
        </IconButton>
        <Button variant="secondary" disabled={!inputValue.trim()}>
          Send
        </Button>
      </div>
    );

    return (
      <div className="p-6 bg-[var(--agyn-bg-light)] min-h-screen flex items-center justify-center">
        <div className="w-full max-w-5xl h-[640px]">
          <Conversation
            {...args}
            runs={multiRunData}
            queuedMessages={sampleQueued}
            reminders={sampleReminders}
            header={header}
            footer={footer}
          />
        </div>
      </div>
    );
  },
  args: {},
};

const minimalRuns: Run[] = [
  {
    id: 'run-min-1',
    status: 'finished',
    duration: '1.2s',
    tokens: 234,
    cost: '$0.004',
    messages: [
      {
        id: 'msg-min-1',
        role: 'user',
        content: 'Hello!',
        timestamp: '9:00 AM',
      },
      {
        id: 'msg-min-2',
        role: 'assistant',
        content: 'Hi! How can I help you today?',
        timestamp: '9:00 AM',
      },
    ],
  },
];

const statusRuns: Run[] = [
  {
    id: 'run-status-1',
    status: 'finished',
    duration: '1.5s',
    tokens: 412,
    cost: '$0.006',
    messages: [
      {
        id: 'msg-s1',
        role: 'user',
        content: 'Test completed run',
        timestamp: '11:00 AM',
      },
      {
        id: 'msg-s2',
        role: 'assistant',
        content: 'This run completed successfully.',
        timestamp: '11:00 AM',
      },
    ],
  },
  {
    id: 'run-status-2',
    status: 'running',
    tokens: 123,
    messages: [
      {
        id: 'msg-s3',
        role: 'user',
        content: 'Test running run',
        timestamp: '11:01 AM',
      },
    ],
  },
  {
    id: 'run-status-3',
    status: 'failed',
    duration: '0.8s',
    tokens: 89,
    messages: [
      {
        id: 'msg-s4',
        role: 'user',
        content: 'Test failed run',
        timestamp: '11:02 AM',
      },
      {
        id: 'msg-s5',
        role: 'system',
        content: 'Error: Connection timeout',
        timestamp: '11:02 AM',
      },
    ],
  },
  {
    id: 'run-status-4',
    status: 'pending',
    messages: [
      {
        id: 'msg-s6',
        role: 'user',
        content: 'Test pending run',
        timestamp: '11:03 AM',
      },
    ],
  },
];

export const Minimal: Story = {
  render: () => (
    <div className="p-6 bg-[var(--agyn-bg-light)] min-h-screen flex items-center justify-center">
      <div className="w-full max-w-3xl h-[300px]">
        <Conversation runs={minimalRuns} />
      </div>
    </div>
  ),
};

export const StatusVariations: Story = {
  render: () => (
    <div className="p-6 bg-[var(--agyn-bg-light)] min-h-screen flex items-center justify-center">
      <div className="w-full max-w-3xl h-[500px]">
        <Conversation runs={statusRuns} />
      </div>
    </div>
  ),
};

export const MessageRoles: Story = {
  render: () => (
    <div className="p-6 bg-[var(--agyn-bg-light)] min-h-screen flex items-center justify-center">
      <div className="w-full max-w-3xl h-[400px]">
        <Conversation
          runs={[
            {
              id: 'run-roles',
              status: 'finished',
              duration: '2.0s',
              tokens: 500,
              cost: '$0.008',
              messages: [
                {
                  id: 'role-1',
                  role: 'system',
                  content: 'System message - used for system notifications and status updates',
                  timestamp: '12:00 PM',
                },
                {
                  id: 'role-2',
                  role: 'user',
                  content: 'User message - messages from the user',
                  timestamp: '12:00 PM',
                },
                {
                  id: 'role-3',
                  role: 'assistant',
                  content: 'Assistant message - responses from the AI assistant',
                  timestamp: '12:00 PM',
                },
                {
                  id: 'role-4',
                  role: 'tool',
                  content: 'Tool message - output from tool executions and integrations',
                  timestamp: '12:00 PM',
                },
              ],
            },
          ]}
        />
      </div>
    </div>
  ),
};

export const MarkdownExamples: Story = {
  render: () => (
    <div className="p-6 bg-[var(--agyn-bg-light)] min-h-screen flex items-center justify-center">
      <div className="w-full max-w-3xl h-[800px]">
        <Conversation
          runs={[
            {
              id: 'run-markdown',
              status: 'finished',
              duration: '3.5s',
              tokens: 1250,
              cost: '$0.019',
              messages: [
                {
                  id: 'md-1',
                  role: 'user',
                  content: 'Can you show me how to use markdown in messages?',
                  timestamp: '2:00 PM',
                },
                {
                  id: 'md-2',
                  role: 'assistant',
                  content:
                    '# Markdown Support\n\nMessages support full markdown syntax! Here are some examples:\n\n## Text Formatting\n\nYou can use **bold text**, *italic text*, and even ~~strikethrough~~.\n\n## Code Examples\n\nHere' +
                    "'" +
                    "s some inline code: `const greeting = \"Hello World\"`\n\nAnd here'" +
                    "s a code block with syntax highlighting:\n\n```typescript\ninterface User {\n  id: string;\n  name: string;\n  email: string;\n}\n\nasync function getUser(id: string): Promise<User> {\n  const response = await fetch(`/api/users/${id}`);\n  return response.json();\n}\n```\n\n## Lists\n\n### Unordered Lists\n- First item\n- Second item\n- Third item with more details\n\n### Ordered Lists\n1. Initialize project\n2. Install dependencies\n3. Run development server\n\n## Links and Quotes\n\nCheck out [Agyn.io](https://agyn.io) for more information.\n\n> This is a blockquote. It'" +
                    "s great for highlighting important information or quotes from documentation.\n\n## Tables\n\n| Feature | Status | Priority |\n|---------|--------|----------|\n| Authentication | ✅ Done | High |\n| Dashboard | 🚧 In Progress | High |\n| Analytics | 📋 Planned | Medium |\n\n---\n\nThat'" +
                    "s the basics of markdown support!",
                  timestamp: '2:00 PM',
                },
                {
                  id: 'md-3',
                  role: 'user',
                  content: 'Great! Can you show me a Python example?',
                  timestamp: '2:01 PM',
                },
                {
                  id: 'md-4',
                  role: 'assistant',
                  content:
                    "Sure! Here's a Python example with **FastAPI**:\n\n```python\nfrom fastapi import FastAPI, HTTPException\nfrom pydantic import BaseModel\nfrom typing import List, Optional\n\napp = FastAPI()\n\nclass User(BaseModel):\n    id: int\n    name: str\n    email: str\n    active: bool = True\n\nusers_db: List[User] = []\n\n@app.get(\"/users/{user_id}\")\nasync def get_user(user_id: int) -> User:\n    \"\"\"Get a user by ID\"\"\"\n    user = next((u for u in users_db if u.id == user_id), None)\n    if not user:\n        raise HTTPException(status_code=404, detail=\"User not found\")\n    return user\n\n@app.post(\"/users\")\nasync def create_user(user: User) -> User:\n    \"\"\"Create a new user\"\"\"\n    users_db.append(user)\n    return user\n```\n\n### Key Features:\n- Type hints for better code quality\n- Automatic API documentation\n- Built-in validation with Pydantic",
                  timestamp: '2:01 PM',
                },
                {
                  id: 'md-5',
                  role: 'tool',
                  content:
                    'Analyzing code structure...\n\n```json\n{\n  "endpoints": 2,\n  "models": 1,\n  "dependencies": ["fastapi", "pydantic"],\n  "status": "valid"\n}\n```',
                  timestamp: '2:01 PM',
                },
              ],
            },
          ]}
        />
      </div>
    </div>
  ),
};

export const QueueAndRemindersOnly: Story = {
  render: () => (
    <div className="p-6 bg-[var(--agyn-bg-light)] min-h-screen flex items-center justify-center">
      <div className="w-full max-w-3xl h-[350px]">
        <Conversation runs={minimalRuns} queuedMessages={sampleQueued} reminders={sampleReminders} />
      </div>
    </div>
  ),
};

export const WordWrapTest: Story = {
  render: () => (
    <div className="p-6 bg-[var(--agyn-bg-light)] min-h-screen flex items-center justify-center">
      <div className="w-full max-w-3xl h-[500px]">
        <Conversation
          runs={[
            {
              id: 'run-wordwrap',
              status: 'finished',
              duration: '1.2s',
              tokens: 450,
              cost: '$0.007',
              messages: [
                {
                  id: 'wrap-1',
                  role: 'user',
                  content: 'Test with a very long string without spaces',
                  timestamp: '3:00 PM',
                },
                {
                  id: 'wrap-2',
                  role: 'assistant',
                  content:
                    'Here is a very long string without any spaces to test word wrapping: thisisaverylongstringwithoutanyspacestotestwordwrappingandmakesuretheconversationlayoutdoesnotbreakwhenuserspasteorsendreallyreallylongcontinuousstringsofdataliketokensAPIkeysorsomeotherlonghashvaluesthiscouldhappeninrealworldusagescenarios',
                  timestamp: '3:00 PM',
                },
                {
                  id: 'wrap-3',
                  role: 'user',
                  content: 'Now test it inside a code block',
                  timestamp: '3:01 PM',
                },
                {
                  id: 'wrap-4',
                  role: 'assistant',
                  content:
                    "Here's a long string inside a code block:\n\n```\nverylongstringwithoutspacesinsideacodeblockthisshouldalsowrapproperlyandnotbreakthelayoutthisisimportantfortokensAPIkeyshashesoranyotherlongcontinuousdataxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\n```\n\nAnd here's another test with a realistic scenario:\n\n```bash\n# Very long environment variable\nexport JWT_SECRET=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQSflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVadQssw5cverylongbase64encodedstringwithoutspacesthatcouldbreakthelayoutifnothandledproperly\n```\n\nThe layout should remain intact even with these extremely long strings!",
                  timestamp: '3:01 PM',
                },
                {
                  id: 'wrap-5',
                  role: 'tool',
                  content:
                    'Processing: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQSflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVadQssw5cverylongbase64encodedtokenstringwithoutanyspacesthatrepresentsarealisticscenariowhereusersworkwithtokensandkeys',
                  timestamp: '3:01 PM',
                },
                {
                  id: 'wrap-6',
                  role: 'system',
                  content:
                    'All tests passed! URL test: https://api.example.com/v1/endpoint?parameterwithaverylongvalue=thisisaverylongqueryparametervaluewithoutspacesjusttotestifurlsalsobreakthelayouttheyshouldwrapproperlyaswell',
                  timestamp: '3:02 PM',
                },
              ],
            },
          ]}
        />
      </div>
    </div>
  ),
};
