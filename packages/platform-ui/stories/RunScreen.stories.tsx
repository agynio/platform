import type { Meta, StoryObj } from '@storybook/react';
import RunScreen from '../src/components/screens/RunScreen';
import { MainLayout } from '../src/components/layouts/MainLayout';
import type { RunEvent } from '../src/components/RunEventsList';
import type { EventType } from '../src/components/RunEventDetails';
import type { Status } from '../src/components/StatusIndicator';

const meta: Meta<typeof RunScreen> = {
  title: 'Screens/Run',
  component: RunScreen,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['!autodocs'],
};

export default meta;

type Story = StoryObj<typeof RunScreen>;

const sampleEvents: RunEvent[] = [
  {
    id: 'evt-1',
    type: 'message' as EventType,
    timestamp: '2:34:12 PM',
    status: 'finished',
    data: {
      messageSubtype: 'source',
      content:
        'Can you help me implement a user authentication system with JWT tokens and OAuth 2.0 integration?',
    },
  },
  {
    id: 'evt-2',
    type: 'llm' as EventType,
    timestamp: '2:34:15 PM',
    duration: '2.3s',
    status: 'finished',
    data: {
      context:
        'Previous conversation about JWT implementation and high-level architecture decisions...',
      response:
        "I'll help you implement a comprehensive authentication system. Let me break this down into steps and create the necessary files.",
      model: 'gpt-4-turbo',
      tokens: {
        input: 1234,
        output: 856,
        total: 2090,
      },
      cost: '$0.0234',
    },
  },
  {
    id: 'evt-3',
    type: 'tool' as EventType,
    timestamp: '2:34:17 PM',
    duration: '1.2s',
    status: 'finished',
    data: {
      toolName: 'file_write',
      toolSubtype: 'generic',
      input: {
        path: '/src/auth/jwt.ts',
        content:
          'import jwt from "jsonwebtoken";\n\nexport function generateToken(payload: any) {\n  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1h" });\n}',
      },
      output: {
        success: true,
        path: '/src/auth/jwt.ts',
        bytesWritten: 234,
      },
    },
  },
  {
    id: 'evt-4',
    type: 'tool' as EventType,
    timestamp: '2:34:19 PM',
    duration: '0.8s',
    status: 'finished',
    data: {
      toolName: 'shell',
      toolSubtype: 'shell',
      command: 'npm install jsonwebtoken bcrypt express-session passport passport-jwt',
      output:
        'added 12 packages, and audited 200 packages in 2s\n\nfound 0 vulnerabilities',
      exitCode: 0,
      workingDir: '/home/user/project',
    },
  },
  {
    id: 'evt-5',
    type: 'summarization' as EventType,
    timestamp: '2:34:38 PM',
    duration: '1.8s',
    data: {
      summary:
        'Implemented JWT-based authentication with OAuth 2.0 integration, added security best practices, and identified one failing test related to empty JWT_SECRET handling.',
      tokensReduced: 2847,
      compressionRatio: '4.2x',
    },
  },
  {
    id: 'evt-6',
    type: 'message' as EventType,
    timestamp: '2:34:45 PM',
    data: {
      messageSubtype: 'result',
      content:
        'Authentication system implementation complete! All tests passing. JWT token generation, OAuth 2.0 providers, and security best practices are in place.',
    },
  },
];

export const Default: Story = {
  render: (args) => (
    <MainLayout selectedMenuItem="threads">
      <RunScreen {...args} />
    </MainLayout>
  ),
  args: {
    runId: 'run-001',
    status: 'running' as Status,
    createdAt: new Date().toISOString(),
    duration: '2.3s',
    statistics: {
      totalEvents: 2,
      messages: 1,
      llm: 1,
      tools: 0,
      summaries: 0,
    },
    tokens: {
      input: 500,
      cached: 0,
      output: 300,
      reasoning: 0,
      total: 800,
    },
    events: sampleEvents,
  },
};
