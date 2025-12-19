import type { Meta, StoryObj } from '@storybook/react';
import { MemoryRouter } from 'react-router-dom';
import { RunEventDetails, type EventType } from '../src/components/RunEventDetails';
import type { RunEvent } from '../src/components/RunEventsList';

const meta: Meta<typeof RunEventDetails> = {
  title: 'Screens/Run/RunEventDetails',
  component: RunEventDetails,
  parameters: {
    layout: 'centered',
  },
  tags: ['!autodocs'],
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof RunEventDetails>;

const mockEvents: RunEvent[] = [
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
      context: [
        {
          role: 'system',
          timestamp: '2024-11-20T14:34:13.000Z',
          content:
            'You are a helpful AI assistant specialized in software development. You have access to file system tools and can help users write, read, and modify code.',
          __agynIsNew: true,
        },
        {
          role: 'user',
          timestamp: '2024-11-20T14:34:15.000Z',
          content:
            'Can you help me implement a user authentication system with JWT tokens and OAuth 2.0 integration?',
          __agynIsNew: true,
        },
        {
          role: 'assistant',
          timestamp: '2024-11-20T14:34:16.500Z',
          reasoning: {
            tokens: 1245,
            id: 'reasoning_abc123def456',
          },
          content:
            "I'll help you implement a comprehensive authentication system. Let me break this down into steps and create the necessary files.",
          tool_calls: [
            {
              name: 'write_file',
              arguments: {
                path: '/src/auth/jwt.ts',
                content:
                  'import jwt from "jsonwebtoken";\n\nexport function generateToken(payload: any) {\n  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1h" });\n}',
              },
            },
          ],
        },
        {
          role: 'tool',
          timestamp: '2024-11-20T14:34:17.200Z',
          name: 'write_file',
          content: '{"success": true, "path": "/src/auth/jwt.ts", "bytesWritten": 234}',
        },
        {
          role: 'user',
          timestamp: '2024-11-20T14:34:18.000Z',
          content: 'Great! Now can you add OAuth integration?',
        },
      ],
      response:
        "I'll help you implement a comprehensive authentication system. Let's break this down into steps:\n\n1. First, we'll set up JWT token generation and validation\n2. Then integrate OAuth 2.0 providers like Google and GitHub\n3. Implement refresh token logic\n4. Add security best practices\n\nLet me start by creating the JWT utility functions...",
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
        options: {
          encoding: 'utf8',
          mode: 0o644,
          createDirectories: true,
          permissions: {
            user: { read: true, write: true, execute: false },
            group: { read: true, write: false, execute: false },
            other: { read: true, write: false, execute: false },
          },
        },
        metadata: {
          author: 'system',
          timestamp: '2024-11-20T14:34:17Z',
          version: '1.0.0',
          tags: ['authentication', 'jwt', 'security'],
          dependencies: [
            { name: 'jsonwebtoken', version: '^9.0.0', type: 'production' },
            { name: '@types/jsonwebtoken', version: '^9.0.0', type: 'dev' },
          ],
        },
      },
      output: {
        success: true,
        path: '/src/auth/jwt.ts',
        bytesWritten: 234,
        stats: {
          size: 234,
          created: '2024-11-20T14:34:17Z',
          modified: '2024-11-20T14:34:17Z',
        },
        checksums: {
          md5: 'a1b2c3d4e5f6',
          sha256:
            'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        },
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
      command:
        'npm install jsonwebtoken bcrypt express-session passport passport-jwt passport-google-oauth20 passport-github2 express-rate-limit helmet cors cookie-parser express-validator dotenv @types/jsonwebtoken @types/bcrypt @types/passport @types/passport-jwt @types/passport-google-oauth20 @types/passport-github2 @types/cookie-parser --save-dev @types/node @types/express typescript ts-node nodemon eslint prettier @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint-config-prettier eslint-plugin-prettier jest @types/jest ts-jest supertest @types/supertest axios mongoose @types/mongoose redis ioredis @types/ioredis winston morgan compression multer @types/multer joi celebrate class-validator class-transformer reflect-metadata typeorm pg mysql2 sqlite3 jsonwebtoken bcrypt express-session passport passport-jwt passport-google-oauth20 passport-github2 express-rate-limit helmet cors cookie-parser express-validator dotenv @types/jsonwebtoken @types/bcrypt @types/passport @types/passport-jwt @types/passport-google-oauth20 @types/passport-github2 @types/cookie-parser --save-dev @types/node @types/express typescript ts-node nodemon eslint prettier @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint-config-prettier eslint-plugin-prettier jest @types/jest ts-jest supertest @types/supertest axios mongoose @types/mongoose redis ioredis @types/ioredis winston morgan compression multer @types/multer joi celebrate class-validator class-transformer reflect-metadata typeorm pg mysql2 sqlite3',
      output:
        'added 47 packages, and audited 532 packages in 3s\n\n89 packages are looking for funding\n  run `npm fund` for details\n\nfound 0 vulnerabilities',
      exitCode: 0,
      workingDir: '/home/user/project',
    },
  },
  {
    id: 'evt-5',
    type: 'llm' as EventType,
    timestamp: '2:34:22 PM',
    duration: '3.1s',
    status: 'running',
    data: {
      context: 'Previous conversation about JWT implementation...',
      response:
        "Great! Now let's implement the OAuth 2.0 integration. I'll create a configuration file for different providers and implement the OAuth flow handlers.",
      model: 'gpt-4-turbo',
      tokens: {
        input: 2456,
        output: 1234,
        total: 3690,
      },
      cost: '$0.0412',
    },
  },
  {
    id: 'evt-6',
    type: 'tool' as EventType,
    timestamp: '2:34:26 PM',
    duration: '4.5s',
    status: 'finished',
    data: {
      toolName: 'manage_agent',
      toolSubtype: 'manage',
      input: {
        command: 'review_security',
        worker: 'agent-security-review',
        threadAlias: 'auth-implementation-review',
        message:
          'Review the JWT implementation for security vulnerabilities and best practices. Focus on:\n\n- Secret key strength\n- Token expiration policies\n- Refresh token mechanism\n- Rate limiting for auth endpoints',
      },
      output: {
        status: 'completed',
        subthreadId: 'thread-auth-review-2024',
        runId: 'run-security-scan-xyz789',
        findings: [
          'JWT secret should be at least 256 bits',
          'Consider implementing token rotation',
          'Add rate limiting for authentication endpoints',
          'Implement refresh token blacklisting',
        ],
        recommendation:
          'Overall implementation is good. Apply the suggested improvements for production readiness.',
        securityScore: 8.5,
      },
    },
  },
  {
    id: 'evt-6a',
    type: 'message' as EventType,
    timestamp: '2:34:30 PM',
    data: {
      messageSubtype: 'intermediate',
      content:
        'Security review complete. Implementing recommended improvements for JWT secret validation and token rotation.',
    },
  },
  {
    id: 'evt-7',
    type: 'tool' as EventType,
    timestamp: '2:34:32 PM',
    duration: '0.6s',
    data: {
      toolName: 'shell',
      toolSubtype: 'shell',
      command: 'npm run test:auth',
      output:
        'FAIL  src/auth/jwt.test.ts\n  ● JWT Token Generation › should fail with invalid secret\n\n    expect(received).toThrow()\n\n    Received function did not throw\n\n      12 |   test("should fail with invalid secret", () => {\n      13 |     process.env.JWT_SECRET = "";\n    > 14 |     expect(() => generateToken({ id: 1 })).toThrow();\n         |                                             ^\n      15 |   });\n\nTests: 1 failed, 4 passed, 5 total',
      exitCode: 1,
      workingDir: '/home/user/project',
    },
  },
  {
    id: 'evt-8',
    type: 'summarization' as EventType,
    timestamp: '2:34:38 PM',
    duration: '1.8s',
    data: {
      summary:
        '# Authentication System Implementation Summary\n\n'
        + '## Overview\n'
        + 'Implemented a comprehensive JWT-based authentication system with JWT tokens and OAuth 2.0 integration for Google and GitHub providers. The system includes token generation, validation, refresh token logic, and security best practices.\n\n'
        + '## Key Components Implemented\n\n'
        + '### JWT Token System\n'
        + '- Created `/src/auth/jwt.ts` with token generation and validation functions\n'
        + '- Implemented token expiration handling (1 hour default)\n'
        + '- Added JWT secret validation to prevent empty or invalid secrets\n'
        + '- Configured proper signing algorithms (HS256)\n\n'
        + '### OAuth 2.0 Integration\n'
        + '- Set up OAuth provider configuration for Google and GitHub\n'
        + '- Implemented authorization code flow\n'
        + '- Added state parameter for CSRF protection\n'
        + '- Created callback handlers for provider responses\n\n'
        + '### Security Features\n'
        + '- Environment variable validation for JWT_SECRET\n'
        + '- Token rotation mechanism (in progress)\n'
        + '- Rate limiting for authentication endpoints (needs implementation)\n'
        + '- Secure cookie handling with httpOnly and secure flags\n'
        + '- Password hashing using bcrypt\n\n'
        + '## Test Results\n'
        + '- Total tests: 5\n'
        + '- Passed: 4\n'
        + '- Failed: 1 (empty JWT secret handling)\n\n'
        + '### Failing Test\n'
        + 'The test "should fail with invalid secret" is currently failing because the generateToken function was not properly throwing an error when JWT_SECRET is empty. This has been identified and needs to be fixed.\n\n'
        + '## Security Review Findings\n'
        + '1. **Token Rotation**: Need to implement refresh token rotation to prevent token reuse attacks\n'
        + '2. **Rate Limiting**: Add rate limiting to prevent brute force attacks on login endpoints\n'
        + '3. **Secret Validation**: Improve validation of JWT secret (partially addressed)\n'
        + '4. **Token Blacklisting**: Consider implementing token blacklist for logout functionality\n\n'
        + '## Next Steps\n'
        + '1. Fix the failing test by adding proper secret validation\n'
        + '2. Implement token rotation mechanism\n'
        + '3. Add rate limiting middleware\n'
        + '4. Complete integration tests for OAuth flows\n'
        + '5. Add monitoring and logging for authentication events',
      oldContext: [
        {
          role: 'system',
          timestamp: '2024-11-20T14:30:00.000Z',
          content:
            'You are a helpful AI assistant specialized in software development.',
        },
        {
          role: 'user',
          timestamp: '2024-11-20T14:30:05.000Z',
          content:
            'I need to build an authentication system. Should I use JWT or sessions?',
        },
        {
          role: 'assistant',
          timestamp: '2024-11-20T14:30:10.000Z',
          reasoning: { tokens: 850 },
          content:
            "Both have their merits. JWT is stateless and works well for distributed systems, while sessions are more secure for traditional web apps. For your use case with OAuth, I'd recommend JWT.",
        },
        {
          role: 'user',
          timestamp: '2024-11-20T14:30:25.000Z',
          content: "Okay, let's go with JWT. Can you help me implement it?",
        },
        {
          role: 'assistant',
          timestamp: '2024-11-20T14:30:30.000Z',
          content:
            "I'll help you implement a comprehensive authentication system with JWT and OAuth 2.0.",
          tool_calls: [{ name: 'write_file', arguments: { path: '/src/auth/jwt.ts' } }],
        },
        {
          role: 'tool',
          timestamp: '2024-11-20T14:30:32.000Z',
          name: 'write_file',
          content: '{"success": true}',
        },
        {
          role: 'user',
          timestamp: '2024-11-20T14:31:00.000Z',
          content:
            'Great! Now add OAuth integration with Google and GitHub.',
        },
        {
          role: 'assistant',
          timestamp: '2024-11-20T14:31:05.000Z',
          reasoning: { tokens: 1120 },
          content:
            "I'll set up OAuth 2.0 providers for Google and GitHub.",
          tool_calls: [{ name: 'write_file', arguments: { path: '/src/auth/oauth.ts' } }],
        },
      ],
      newContext: [
        {
          role: 'system',
          timestamp: '2024-11-20T14:34:00.000Z',
          content:
            'You are a helpful AI assistant specialized in software development.',
        },
        {
          role: 'user',
          timestamp: '2024-11-20T14:34:05.000Z',
          content:
            'Implementing JWT + OAuth 2.0 auth system. Need token rotation & rate limiting. Fix empty secret test.',
        },
      ],
      tokensReduced: 2847,
      compressionRatio: '4.2x',
    },
  },
  {
    id: 'evt-9',
    type: 'llm' as EventType,
    timestamp: '2:34:41 PM',
    duration: '2.7s',
    data: {
      context:
        'Summarized conversation about auth implementation and test failure...',
      response:
        "I see the test is failing because we're not properly validating the JWT secret. Let me fix the generateToken function to throw an error when the secret is empty or invalid.",
      model: 'gpt-4-turbo',
      tokens: {
        input: 892,
        output: 445,
        total: 1337,
      },
      cost: '$0.0148',
    },
  },
  {
    id: 'evt-10',
    type: 'tool' as EventType,
    timestamp: '2:34:44 PM',
    duration: '0.5s',
    data: {
      toolName: 'file_edit',
      toolSubtype: 'generic',
      input: {
        path: '/src/auth/jwt.ts',
        changes: 'Added validation for JWT_SECRET environment variable',
      },
      output:
        'File updated successfully. Added secret validation logic.',
    },
  },
  {
    id: 'evt-11',
    type: 'message' as EventType,
    timestamp: '2:34:45 PM',
    data: {
      messageSubtype: 'result',
      content:
        'Authentication system implementation complete! All tests passing. JWT token generation with proper secret validation, OAuth 2.0 provider configuration, and security best practices implemented.',
    },
  },
];

export const MessageSource: Story = {
  args: { event: mockEvents[0] },
};

export const LlmWithContextAndTools: Story = {
  args: { event: mockEvents[1] },
};

export const FileWriteTool: Story = {
  args: { event: mockEvents[2] },
};

export const ShellInstallTool: Story = {
  args: { event: mockEvents[3] },
};

export const LlmRunning: Story = {
  args: { event: mockEvents[4] },
};

export const ManageAgentTool: Story = {
  args: { event: mockEvents[5] },
};

export const MessageIntermediate: Story = {
  args: { event: mockEvents[6] },
};

export const ShellTestFailure: Story = {
  args: { event: mockEvents[7] },
};

export const Summarization: Story = {
  args: { event: mockEvents[8] },
};

export const LlmAfterSummarization: Story = {
  args: { event: mockEvents[9] },
};

export const FileEditTool: Story = {
  args: { event: mockEvents[10] },
};

export const MessageResult: Story = {
  args: { event: mockEvents[11] },
};
