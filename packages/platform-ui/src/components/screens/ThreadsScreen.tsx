import { useState } from 'react';
import { ArrowLeft, Play, Container, Bell, Send, PanelRightClose, PanelRight } from 'lucide-react';
import { IconButton } from '../IconButton';
import { ThreadsList } from '../ThreadsList';
import { Thread } from '../ThreadItem';
import { SegmentedControl } from '../SegmentedControl';
import { Conversation, Run } from '../Conversation';
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover';
import { StatusIndicator } from '../StatusIndicator';
import { AutosizeTextarea } from '../AutosizeTextarea';
import { MainSidebar } from '../MainSidebar';

interface ThreadsScreenProps {
  onBack: () => void;
  selectedMenuItem?: string;
  onMenuItemSelect?: (itemId: string) => void;
}

// Mock data
const mockThreads: Thread[] = [
  {
    id: '1',
    summary: 'Implement user authentication flow with OAuth 2.0',
    agentName: 'Auth Agent',
    createdAt: '2 hours ago',
    status: 'running',
    isOpen: true,
  },
  {
    id: '2',
    summary: 'Refactor database queries for better performance',
    agentName: 'DB Agent',
    createdAt: '5 hours ago',
    status: 'finished',
    isOpen: true,
    subthreads: [
      {
        id: '2-1',
        summary: 'Optimize index usage in user queries',
        agentName: 'Optimizer',
        createdAt: '4 hours ago',
        status: 'finished',
        isOpen: true,
      },
    ],
  },
  {
    id: '3',
    summary: 'Design new landing page components',
    agentName: 'Design Agent',
    createdAt: '1 day ago',
    status: 'pending',
    isOpen: false,
  },
];

const mockRuns: Run[] = [
  {
    id: 'run-1',
    status: 'finished',
    duration: '2m 34s',
    tokens: 1234,
    cost: '$0.05',
    messages: [
      {
        id: 'msg-1',
        role: 'user',
        content: 'Can you help me implement OAuth 2.0 authentication?',
        timestamp: '10:30 AM',
      },
      {
        id: 'msg-2',
        role: 'assistant',
        content: `I'll help you implement OAuth 2.0 authentication. Let me start by setting up the necessary dependencies and configuration.

## Implementation Plan

1. Install required packages
2. Set up OAuth provider configuration
3. Create authentication endpoints
4. Implement token management

Let's begin!`,
        timestamp: '10:31 AM',
      },
      {
        id: 'msg-3',
        role: 'tool',
        content:
          'Installing OAuth 2.0 libraries...\n\n```bash\nnpm install passport passport-oauth2 jsonwebtoken bcrypt\n```',
        timestamp: '10:31 AM',
      },
    ],
  },
  {
    id: 'run-2',
    status: 'finished',
    duration: '3m 12s',
    tokens: 2156,
    cost: '$0.08',
    messages: [
      {
        id: 'msg-4',
        role: 'system',
        content: 'Packages installed successfully. Ready to configure OAuth provider.',
        timestamp: '10:34 AM',
      },
      {
        id: 'msg-5',
        role: 'assistant',
        content: `Great! Now let's set up the OAuth configuration. Here's the basic setup:

\`\`\`typescript
import passport from 'passport';
import { Strategy as OAuth2Strategy } from 'passport-oauth2';

// Configure OAuth2 strategy
passport.use(new OAuth2Strategy({
  authorizationURL: 'https://provider.com/oauth/authorize',
  tokenURL: 'https://provider.com/oauth/token',
  clientID: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL: 'http://localhost:3000/auth/callback'
}, (accessToken, refreshToken, profile, done) => {
  // Handle user profile
  return done(null, profile);
}));
\`\`\`

### Environment Variables

Make sure to add these to your \`.env\` file:
- \`CLIENT_ID\`
- \`CLIENT_SECRET\`
- \`SESSION_SECRET\``,
        timestamp: '10:35 AM',
      },
    ],
  },
  {
    id: 'run-3',
    status: 'finished',
    duration: '1m 45s',
    tokens: 892,
    cost: '$0.03',
    messages: [
      {
        id: 'msg-6',
        role: 'user',
        content: 'Can you add JWT token generation?',
        timestamp: '10:37 AM',
      },
      {
        id: 'msg-7',
        role: 'assistant',
        content: `Absolutely! Let's add JWT token generation for secure authentication:

\`\`\`typescript
import jwt from 'jsonwebtoken';

interface TokenPayload {
  userId: string;
  email: string;
}

export function generateToken(payload: TokenPayload): string {
  return jwt.sign(
    payload,
    process.env.JWT_SECRET!,
    { expiresIn: '24h' }
  );
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, process.env.JWT_SECRET!) as TokenPayload;
}
\`\`\`

**Key Features:**
- 24-hour expiration
- Secure secret key from environment
- Type-safe payload`,
        timestamp: '10:37 AM',
      },
    ],
  },
  {
    id: 'run-4',
    status: 'finished',
    duration: '2m 58s',
    tokens: 1678,
    cost: '$0.06',
    messages: [
      {
        id: 'msg-8',
        role: 'assistant',
        content: `Now let's create the authentication routes:

\`\`\`typescript
import express from 'express';
import passport from 'passport';
import { generateToken } from './auth/jwt';

const router = express.Router();

// Login route
router.get('/auth/login',
  passport.authenticate('oauth2')
);

// Callback route
router.get('/auth/callback',
  passport.authenticate('oauth2', { failureRedirect: '/login' }),
  (req, res) => {
    const token = generateToken({
      userId: req.user.id,
      email: req.user.email
    });
    
    res.json({ token });
  }
);

// Logout route
router.post('/auth/logout', (req, res) => {
  req.logout();
  res.json({ message: 'Logged out successfully' });
});

export default router;
\`\`\``,
        timestamp: '10:39 AM',
      },
      {
        id: 'msg-9',
        role: 'tool',
        content: 'Created authentication routes in `routes/auth.ts`',
        timestamp: '10:42 AM',
      },
    ],
  },
  {
    id: 'run-5',
    status: 'finished',
    duration: '1m 22s',
    tokens: 645,
    cost: '$0.02',
    messages: [
      {
        id: 'msg-10',
        role: 'user',
        content: 'Add password hashing for local authentication too',
        timestamp: '10:43 AM',
      },
      {
        id: 'msg-11',
        role: 'assistant',
        content: `Good idea! Let's add bcrypt for secure password hashing:

\`\`\`typescript
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
\`\`\`

> **Security Note:** Using 10 salt rounds provides a good balance between security and performance.`,
        timestamp: '10:43 AM',
      },
    ],
  },
  {
    id: 'run-6',
    status: 'finished',
    duration: '4m 15s',
    tokens: 2834,
    cost: '$0.11',
    messages: [
      {
        id: 'msg-12',
        role: 'assistant',
        content: `Let me create a complete user registration endpoint:

\`\`\`typescript
import { Request, Response } from 'express';
import { hashPassword } from './auth/password';
import { generateToken } from './auth/jwt';
import { User } from './models/User';

export async function register(req: Request, res: Response) {
  try {
    const { email, password, name } = req.body;
    
    // Validate input
    if (!email || !password || !name) {
      return res.status(400).json({ 
        error: 'Missing required fields' 
      });
    }
    
    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ 
        error: 'User already exists' 
      });
    }
    
    // Hash password
    const hashedPassword = await hashPassword(password);
    
    // Create user
    const user = await User.create({
      email,
      password: hashedPassword,
      name
    });
    
    // Generate token
    const token = generateToken({
      userId: user.id,
      email: user.email
    });
    
    res.status(201).json({ token, user });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  }
}
\`\`\`

### API Response Format

| Status | Description |
|--------|-------------|
| 201 | User created successfully |
| 400 | Missing required fields |
| 409 | User already exists |
| 500 | Server error |`,
        timestamp: '10:45 AM',
      },
      {
        id: 'msg-13',
        role: 'tool',
        content: 'Created registration endpoint in `controllers/auth.ts`',
        timestamp: '10:49 AM',
      },
    ],
  },
  {
    id: 'run-7',
    status: 'running',
    tokens: 423,
    messages: [
      {
        id: 'msg-14',
        role: 'user',
        content: 'Can you add middleware to protect routes?',
        timestamp: '10:50 AM',
      },
      {
        id: 'msg-15',
        role: 'assistant',
        content: `Perfect! Let's create authentication middleware:

\`\`\`typescript
import { Request, Response, NextFunction } from 'express';
import { verifyToken } from './auth/jwt';

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
\`\`\`

Now analyzing best practices for middleware implementation...`,
        timestamp: '10:50 AM',
      },
    ],
  },
];

const mockContainers = [
  { id: 'c-1', name: 'auth-service', status: 'running' as const },
  { id: 'c-2', name: 'api-gateway', status: 'running' as const },
  { id: 'c-3', name: 'database', status: 'finished' as const },
];

const mockReminders = [
  { id: 'r-1', title: 'Review PR #123', time: 'Tomorrow at 10:00 AM' },
  { id: 'r-2', title: 'Update documentation', time: 'Friday at 2:00 PM' },
];

export default function ThreadsScreen({ onBack, selectedMenuItem, onMenuItemSelect }: ThreadsScreenProps) {
  const [filterMode, setFilterMode] = useState<'all' | 'open' | 'closed'>('all');
  const [selectedThreadId, setSelectedThreadId] = useState<string>('1');
  const [inputValue, setInputValue] = useState('');
  const [isRunsInfoCollapsed, setIsRunsInfoCollapsed] = useState(false);

  const filteredThreads = mockThreads.filter((thread) => {
    if (filterMode === 'all') return true;
    if (filterMode === 'open') return thread.isOpen;
    if (filterMode === 'closed') return !thread.isOpen;
    return true;
  });

  const selectedThread = mockThreads.find((t) => t.id === selectedThreadId);

  return (
    <div className="h-screen bg-[var(--agyn-bg-light)] flex flex-col">
      {/* Showcase Navigation - NOT PART OF FINAL SCREEN */}
      <div className="h-[40px] bg-[var(--agyn-dark)] border-b border-[var(--agyn-border-subtle)] flex items-center px-4 gap-3">
        <IconButton icon={<ArrowLeft />} onClick={onBack} variant="ghost" size="sm" />
        <span className="text-sm text-white">Threads</span>
      </div>

      {/* Main Screen Content - Full height below navigation */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main Menu MainSidebar - Full Height */}
        <MainSidebar selectedMenuItem={selectedMenuItem} onMenuItemSelect={onMenuItemSelect} />

        {/* Right Side Content */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Main Content - 2 columns */}
          <div className="flex-1 min-w-0 flex overflow-hidden">
            {/* Threads List Column */}
            <div className="w-[360px] border-r border-[var(--agyn-border-subtle)] flex flex-col bg-white">
              {/* Threads List Header - 66px */}
              <div className="h-[66px] flex items-center px-4 border-b border-[var(--agyn-border-subtle)]">
                <SegmentedControl
                  items={[
                    { value: 'all', label: 'All' },
                    { value: 'open', label: 'Open' },
                    { value: 'closed', label: 'Closed' },
                  ]}
                  value={filterMode}
                  onChange={(value) => setFilterMode(value as 'all' | 'open' | 'closed')}
                  size="sm"
                />
              </div>

              {/* Threads List */}
              <div className="flex-1 overflow-hidden">
                <ThreadsList
                  threads={filteredThreads}
                  selectedThreadId={selectedThreadId}
                  onSelectThread={setSelectedThreadId}
                  className="h-full rounded-none border-none"
                />
              </div>
            </div>

            {/* Selected Thread Content */}
            <div className="flex-1 min-w-0 flex flex-col bg-[var(--agyn-bg-light)]">
              {selectedThread ? (
                <>
                  {/* Thread Header */}
                  <div className="bg-white border-b border-[var(--agyn-border-subtle)] p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <StatusIndicator status={selectedThread.status as any} size="sm" />
                          <span className="text-xs text-[var(--agyn-gray)]">{selectedThread.agentName}</span>
                          <span className="text-xs text-[var(--agyn-gray)]">•</span>
                          <span className="text-xs text-[var(--agyn-gray)]">{selectedThread.createdAt}</span>
                        </div>
                        <h3 className="text-[var(--agyn-dark)]">{selectedThread.summary}</h3>
                      </div>
                    </div>

                    {/* Stats Row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        {/* Runs Count */}
                        <div className="flex items-center gap-2">
                          <Play className="w-4 h-4 text-[var(--agyn-gray)]" />
                          <span className="text-sm text-[var(--agyn-dark)]">{mockRuns.length}</span>
                          <span className="text-xs text-[var(--agyn-gray)]">runs</span>
                        </div>

                        {/* Containers Count with Popover */}
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="flex items-center gap-2 hover:bg-[var(--agyn-bg-light)] px-2 py-1 rounded-[6px] transition-colors">
                              <Container className="w-4 h-4 text-[var(--agyn-gray)]" />
                              <span className="text-sm text-[var(--agyn-dark)]">
                                {mockContainers.filter((c) => c.status === 'running').length}
                              </span>
                              <span className="text-xs text-[var(--agyn-gray)]">containers</span>
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[280px]">
                            <div className="space-y-2">
                              <h4 className="text-sm text-[var(--agyn-dark)] mb-3">Containers</h4>
                              {mockContainers.map((container) => (
                                <div
                                  key={container.id}
                                  className="flex items-center justify-between py-2 px-3 bg-[var(--agyn-bg-light)] rounded-[6px]"
                                >
                                  <span className="text-sm text-[var(--agyn-dark)]">{container.name}</span>
                                  <StatusIndicator status={container.status} size="sm" />
                                </div>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>

                        {/* Reminders Count with Popover */}
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="flex items-center gap-2 hover:bg-[var(--agyn-bg-light)] px-2 py-1 rounded-[6px] transition-colors">
                              <Bell className="w-4 h-4 text-[var(--agyn-gray)]" />
                              <span className="text-sm text-[var(--agyn-dark)]">{mockReminders.length}</span>
                              <span className="text-xs text-[var(--agyn-gray)]">reminders</span>
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[280px]">
                            <div className="space-y-2">
                              <h4 className="text-sm text-[var(--agyn-dark)] mb-3">Reminders</h4>
                              {mockReminders.map((reminder) => (
                                <div key={reminder.id} className="py-2 px-3 bg-[var(--agyn-bg-light)] rounded-[6px]">
                                  <p className="text-sm text-[var(--agyn-dark)] mb-1">{reminder.title}</p>
                                  <p className="text-xs text-[var(--agyn-gray)]">{reminder.time}</p>
                                </div>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>

                      {/* Toggle Runs Info Button */}
                      <IconButton
                        icon={
                          isRunsInfoCollapsed ? (
                            <PanelRight className="w-4 h-4" />
                          ) : (
                            <PanelRightClose className="w-4 h-4" />
                          )
                        }
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsRunsInfoCollapsed(!isRunsInfoCollapsed)}
                        title={isRunsInfoCollapsed ? 'Show runs info' : 'Hide runs info'}
                      />
                    </div>
                  </div>

                  {/* Conversation - flex-1 to take remaining space */}
                  <div className="flex-1 min-w-0 overflow-hidden min-h-0">
                    <Conversation
                      runs={mockRuns}
                      className="h-full rounded-none border-none"
                      collapsed={isRunsInfoCollapsed}
                      onCollapsedChange={setIsRunsInfoCollapsed}
                    />
                  </div>

                  {/* Message Input */}
                  <div className="bg-[var(--agyn-bg-light)] border-t border-[var(--agyn-border-subtle)] p-4">
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
                        <IconButton icon={<Send className="w-4 h-4" />} variant="primary" size="sm" />
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-[var(--agyn-gray)]">Select a thread to view details</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
