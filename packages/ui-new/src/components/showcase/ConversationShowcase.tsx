import { useState } from 'react';
import { Send } from 'lucide-react';
import { Panel, PanelHeader, PanelBody } from '../Panel';
import { Conversation, Run, QueuedMessageData, ReminderData } from '../Conversation';
import { AutosizeTextarea } from '../AutosizeTextarea';
import { IconButton } from '../IconButton';
import { Button } from '../Button';
import ComponentPreviewHeader from '../ComponentPreviewHeader';

interface ConversationShowcaseProps {
  onBack: () => void;
}

export default function ConversationShowcase({ onBack }: ConversationShowcaseProps) {
  const [inputValue, setInputValue] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Sample data for a complete conversation
  const multiRunData = [
    {
      id: 'run-001-abc-def',
      status: 'finished' as const,
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
          content: "I'll help you create a user authentication endpoint. Let me analyze the requirements and generate the code.",
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
      status: 'finished' as const,
      duration: '5.1s',
      tokens: 3421,
      cost: '$0.051',
      messages: [
        {
          id: 'msg-4',
          role: 'assistant',
          content: "Here's a secure authentication endpoint implementation with JWT tokens:\n\n```typescript\napp.post('/api/auth/login', async (req, res) => {\n  // Implementation\n});\n```",
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
      status: 'finished' as const,
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
      status: 'finished' as const,
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
    {
      id: 'run-005-yza-bcd',
      status: 'finished' as const,
      duration: '4.2s',
      tokens: 2134,
      cost: '$0.032',
      messages: [
        {
          id: 'msg-12',
          role: 'tool',
          content: 'Generating JWT implementation...',
          timestamp: '10:25 AM',
        },
        {
          id: 'msg-13',
          role: 'assistant',
          content: 'Added JWT token generation with 24-hour expiration and secure secret key handling.',
          timestamp: '10:25 AM',
        },
        {
          id: 'msg-14',
          role: 'user',
          content: 'Great! Can you also add refresh token support?',
          timestamp: '10:26 AM',
        },
      ],
    },
    {
      id: 'run-006-efg-hij',
      status: 'finished' as const,
      duration: '6.3s',
      tokens: 4127,
      cost: '$0.062',
      messages: [
        {
          id: 'msg-15',
          role: 'assistant',
          content: 'I will implement refresh token support with secure storage and rotation.',
          timestamp: '10:26 AM',
        },
        {
          id: 'msg-16',
          role: 'tool',
          content: 'Creating refresh token endpoint and database schema...',
          timestamp: '10:26 AM',
        },
        {
          id: 'msg-17',
          role: 'system',
          content: 'Database migration created for refresh_tokens table.',
          timestamp: '10:26 AM',
        },
      ],
    },
    {
      id: 'run-007-klm-nop',
      status: 'finished' as const,
      duration: '2.9s',
      tokens: 1543,
      cost: '$0.023',
      messages: [
        {
          id: 'msg-18',
          role: 'assistant',
          content: 'Refresh token implementation complete with automatic rotation and expiration.',
          timestamp: '10:27 AM',
        },
        {
          id: 'msg-19',
          role: 'user',
          content: 'Perfect! Now let\'s add rate limiting',
          timestamp: '10:27 AM',
        },
      ],
    },
    {
      id: 'run-008-qrs-tuv',
      status: 'finished' as const,
      duration: '3.5s',
      tokens: 1876,
      cost: '$0.028',
      messages: [
        {
          id: 'msg-20',
          role: 'assistant',
          content: 'I will add rate limiting to prevent brute force attacks on the authentication endpoints.',
          timestamp: '10:27 AM',
        },
        {
          id: 'msg-21',
          role: 'tool',
          content: 'Installing express-rate-limit package...',
          timestamp: '10:27 AM',
        },
        {
          id: 'msg-22',
          role: 'system',
          content: 'Rate limiting configured: 5 attempts per 15 minutes per IP.',
          timestamp: '10:28 AM',
        },
      ],
    },
    {
      id: 'run-009-wxy-zab',
      status: 'finished' as const,
      duration: '1.4s',
      tokens: 523,
      cost: '$0.008',
      messages: [
        {
          id: 'msg-23',
          role: 'user',
          content: 'Looks great! Can you write tests for all of this?',
          timestamp: '10:28 AM',
        },
      ],
    },
    {
      id: 'run-010-cde-fgh',
      status: 'running' as const,
      tokens: 2156,
      messages: [
        {
          id: 'msg-24',
          role: 'assistant',
          content: 'I will create comprehensive test suites for all authentication endpoints.',
          timestamp: '10:28 AM',
        },
        {
          id: 'msg-25',
          role: 'tool',
          content: 'Generating test cases for login, refresh, and rate limiting...',
          timestamp: '10:28 AM',
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
      date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Tomorrow
    },
  ];

  // Minimal example
  const minimalRuns: Run[] = [
    {
      id: 'run-min-1',
      status: 'finished' as const,
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

  // Different statuses example
  const statusRuns: Run[] = [
    {
      id: 'run-status-1',
      status: 'finished' as const,
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
      status: 'running' as const,
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
      status: 'failed' as const,
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
      status: 'pending' as const,
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

  return (
    <div>
      <ComponentPreviewHeader
        title="Conversation"
        description="Chat interface with runs, queued messages, and reminders"
        onBack={onBack}
      />

      <div className="space-y-6">
        {/* Full Example */}
        <Panel variant="elevated">
          <PanelHeader>
            <div className="flex items-center justify-between">
              <h3>Complete Conversation Example</h3>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={!isCollapsed ? 'primary' : 'secondary'}
                  onClick={() => setIsCollapsed(false)}
                >
                  Expanded
                </Button>
                <Button
                  size="sm"
                  variant={isCollapsed ? 'primary' : 'secondary'}
                  onClick={() => setIsCollapsed(true)}
                >
                  Collapsed
                </Button>
              </div>
            </div>
          </PanelHeader>
          <PanelBody>
            <p className="text-sm text-[var(--agyn-gray)] mb-4">
              Full conversation with multiple runs, queued messages, and reminders. Notice the run
              boundaries and metrics in the right column.
            </p>
            <div className="h-[600px]">
              <Conversation
                runs={multiRunData}
                queuedMessages={sampleQueued}
                reminders={sampleReminders}
                collapsed={isCollapsed}
                onCollapsedChange={setIsCollapsed}
                header={
                  <div>
                    <h3 className="text-[var(--agyn-dark)]">Authentication Implementation</h3>
                    <p className="text-sm text-[var(--agyn-gray)] mt-1">
                      Working on secure user authentication
                    </p>
                  </div>
                }
                footer={
                  <div className="relative">
                    <AutosizeTextarea
                      placeholder="Type a message..."
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      size="sm"
                      minLines={1}
                      maxLines={8}
                      className="pr-12"
                    />
                    <div className="absolute bottom-[11px] right-[5px]">
                      <IconButton 
                        icon={<Send className="w-4 h-4" />}
                        variant="primary" 
                        size="sm"
                      />
                    </div>
                  </div>
                }
              />
            </div>
          </PanelBody>
        </Panel>

        {/* Minimal Example */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Minimal Example</h3>
          </PanelHeader>
          <PanelBody>
            <p className="text-sm text-[var(--agyn-gray)] mb-4">
              Simple conversation with one completed run
            </p>
            <div className="h-[300px]">
              <Conversation runs={minimalRuns} />
            </div>
          </PanelBody>
        </Panel>

        {/* Different Run Statuses */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Run Status Variations</h3>
          </PanelHeader>
          <PanelBody>
            <p className="text-sm text-[var(--agyn-gray)] mb-4">
              Demonstrating completed, running, failed, and pending run states
            </p>
            <div className="h-[500px]">
              <Conversation runs={statusRuns} />
            </div>
          </PanelBody>
        </Panel>

        {/* Message Roles */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Message Role Types</h3>
          </PanelHeader>
          <PanelBody>
            <p className="text-sm text-[var(--agyn-gray)] mb-4">
              All message types with their distinct styling
            </p>
            <div className="h-[400px]">
              <Conversation
                runs={[
                  {
                    id: 'run-roles',
                    status: 'finished' as const,
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
          </PanelBody>
        </Panel>

        {/* Markdown Content Examples */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Markdown Content Examples</h3>
          </PanelHeader>
          <PanelBody>
            <p className="text-sm text-[var(--agyn-gray)] mb-4">
              Messages support full markdown rendering with code syntax highlighting
            </p>
            <div className="h-[800px]">
              <Conversation
                runs={[
                  {
                    id: 'run-markdown',
                    status: 'finished' as const,
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
                        content: `# Markdown Support

Messages support full markdown syntax! Here are some examples:

## Text Formatting

You can use **bold text**, *italic text*, and even ~~strikethrough~~.

## Code Examples

Here's some inline code: \`const greeting = "Hello World"\`

And here's a code block with syntax highlighting:

\`\`\`typescript
interface User {
  id: string;
  name: string;
  email: string;
}

async function getUser(id: string): Promise<User> {
  const response = await fetch(\`/api/users/\${id}\`);
  return response.json();
}
\`\`\`

## Lists

### Unordered Lists
- First item
- Second item
- Third item with more details

### Ordered Lists
1. Initialize project
2. Install dependencies
3. Run development server

## Links and Quotes

Check out [Agyn.io](https://agyn.io) for more information.

> This is a blockquote. It's great for highlighting important information or quotes from documentation.

## Tables

| Feature | Status | Priority |
|---------|--------|----------|
| Authentication | ✅ Done | High |
| Dashboard | 🚧 In Progress | High |
| Analytics | 📋 Planned | Medium |

---

That's the basics of markdown support!`,
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
                        content: `Sure! Here's a Python example with **FastAPI**:

\`\`\`python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI()

class User(BaseModel):
    id: int
    name: str
    email: str
    active: bool = True

users_db: List[User] = []

@app.get("/users/{user_id}")
async def get_user(user_id: int) -> User:
    """Get a user by ID"""
    user = next((u for u in users_db if u.id == user_id), None)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@app.post("/users")
async def create_user(user: User) -> User:
    """Create a new user"""
    users_db.append(user)
    return user
\`\`\`

### Key Features:
- Type hints for better code quality
- Automatic API documentation
- Built-in validation with Pydantic`,
                        timestamp: '2:01 PM',
                      },
                      {
                        id: 'md-5',
                        role: 'tool',
                        content: `Analyzing code structure...

\`\`\`json
{
  "endpoints": 2,
  "models": 1,
  "dependencies": ["fastapi", "pydantic"],
  "status": "valid"
}
\`\`\``,
                        timestamp: '2:01 PM',
                      },
                    ],
                  },
                ]}
              />
            </div>
          </PanelBody>
        </Panel>

        {/* Word Wrap Test */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Word Wrap Test - Long Strings</h3>
          </PanelHeader>
          <PanelBody>
            <p className="text-sm text-[var(--agyn-gray)] mb-4">
              Testing word wrapping with long strings without spaces to ensure layout integrity
            </p>
            <div className="h-[500px]">
              <Conversation
                runs={[
                  {
                    id: 'run-wordwrap',
                    status: 'finished' as const,
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
                        content: 'Here is a very long string without any spaces to test word wrapping: thisisaverylongstringwithoutanyspacestotestwordwrappingandmakesuretheconversationlayoutdoesnotbreakwhenuserspasteorsendreallyreallylongcontinuousstringsofdataliketokensAPIkeysorsomeotherlonghashvaluesthiscouldhappeninrealworldusagescenarios',
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
                        content: `Here's a long string inside a code block:

\`\`\`
verylongstringwithoutspacesinsideacodeblockthisshouldalsowrapproperlyandnotbreakthelayoutthisisimportantfortokensAPIkeyshashesoranyotherlongcontinuousdataxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
\`\`\`

And here's another test with a realistic scenario:

\`\`\`bash
# Very long environment variable
export JWT_SECRET=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQSflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVadQssw5cverylongbase64encodedstringwithoutspacesthatcouldbreakthelayoutifnothandledproperly
\`\`\`

The layout should remain intact even with these extremely long strings!`,
                        timestamp: '3:01 PM',
                      },
                      {
                        id: 'wrap-5',
                        role: 'tool',
                        content: 'Processing: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQSflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVadQssw5cverylongbase64encodedtokenstringwithoutanyspacesthatrepresentsarealisticscenariowhereusersworkwithtokensandkeys',
                        timestamp: '3:01 PM',
                      },
                      {
                        id: 'wrap-6',
                        role: 'system',
                        content: 'All tests passed! URL test: https://api.example.com/v1/endpoint?parameterwithaverylongvalue=thisisaverylongqueryparametervaluewithoutspacesjusttotestifurlsalsobreakthelayouttheyshouldwrapproperlyaswell',
                        timestamp: '3:02 PM',
                      },
                    ],
                  },
                ]}
              />
            </div>
          </PanelBody>
        </Panel>

        {/* Queue and Reminders Only */}
        <Panel variant="elevated">
          <PanelHeader>
            <h3>Queue & Reminders</h3>
          </PanelHeader>
          <PanelBody>
            <p className="text-sm text-[var(--agyn-gray)] mb-4">
              Pending messages section with queued items and scheduled reminders
            </p>
            <div className="h-[350px]">
              <Conversation
                runs={minimalRuns}
                queuedMessages={sampleQueued}
                reminders={sampleReminders}
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
              <code>{`import { Conversation, Run } from './components/Conversation';

const runs: Run[] = [
  {
    id: 'run-001',
    status: 'completed',
    duration: '2.3s',
    tokens: 1547,
    cost: '$0.023',
    messages: [
      {
        id: 'msg-1',
        role: 'user',
        content: 'Hello!',
        timestamp: '10:23 AM',
      },
      {
        id: 'msg-2',
        role: 'assistant',
        content: 'Hi! How can I help?',
        timestamp: '10:23 AM',
      },
    ],
  },
];

const queued = [
  {
    id: 'q-1',
    content: 'Process this next',
  },
];

const reminders = [
  {
    id: 'r-1',
    content: 'Follow up on task',
    scheduledTime: '3:00 PM',
    date: 'Today',
  },
];

<Conversation
  runs={runs}
  queuedMessages={queued}
  reminders={reminders}
  header={<h3>Conversation Title</h3>}
  footer={<Input placeholder="Type a message..." />}
/>`}</code>
            </pre>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}