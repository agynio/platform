import { useState } from 'react';
import RunScreen from '../screens/RunScreen';
import { RunEvent } from '../RunEventsList';
import { Status } from '../StatusIndicator';

const EVENT_TYPES = ['message', 'llm', 'tool', 'summarization'] as const;
const STATUSES: Status[] = ['running', 'finished', 'failed', 'pending', 'terminated'];
const MESSAGE_SUBTYPES = ['source', 'intermediate', 'result'];
const TOOL_NAMES = [
  'read_file',
  'write_file',
  'grep_search',
  'semantic_search',
  'list_dir',
  'run_in_terminal',
  'replace_string_in_file',
  'create_file',
];
const TOOL_SUBTYPES = ['generic', 'filesystem', 'search', 'execution'];
const LLM_MODELS = ['claude-3-5-sonnet-20241022', 'gpt-4-turbo', 'claude-3-opus'];

const SAMPLE_MESSAGES = [
  'Starting analysis of the codebase...',
  'Processing user request',
  'Analyzing file structure',
  'Generating response',
  'Validating changes',
  'Computing optimal solution',
  'Preparing output',
  'Evaluating context',
];

const SAMPLE_LLM_INPUTS = [
  'Can you explain the purpose of this function?',
  'What changes should be made to improve performance?',
  'How should we refactor this component?',
  'What are the potential edge cases?',
  'Can you summarize the main logic flow?',
];

const SAMPLE_LLM_OUTPUTS = [
  'Based on the code analysis, I recommend the following approach:\n\n1. **Refactor the component structure** - Split the large component into smaller, reusable pieces\n2. **Add error boundaries** - Wrap critical sections to prevent cascading failures\n3. **Implement memoization** - Use `useMemo` and `useCallback` for expensive computations\n\nHere\'s an example:\n```typescript\nconst MemoizedComponent = React.memo(({ data }) => {\n  return <div>{data}</div>;\n});\n```',
  'The main purpose of this function is to handle data transformation and validation. It takes raw input, applies business logic rules, and returns a structured output.\n\n**Key responsibilities:**\n- Input sanitization\n- Type conversion\n- Error handling\n- Data normalization',
  'To improve performance, consider implementing memoization for the expensive calculations. The current implementation recalculates on every render.\n\n**Suggested changes:**\n- Cache computed values with `useMemo`\n- Debounce user input handlers\n- Implement virtual scrolling for large lists\n- Use code splitting to reduce bundle size',
  'Here are the key considerations for this refactoring:\n\n**Architecture:**\n- Maintain backward compatibility\n- Keep the public API stable\n- Add comprehensive tests\n\n**Implementation:**\n- Use TypeScript for type safety\n- Follow existing code patterns\n- Document breaking changes',
  'The logic flow can be summarized as follows:\n\n1. First, we validate the input parameters\n2. Then, we fetch the required data from the API\n3. Next, we transform the data into the expected format\n4. Finally, we update the UI state and trigger callbacks\n\nEach step includes error handling and logging for debugging purposes.',
];

const SAMPLE_TOOL_CONTENTS = [
  'Found 3 matches in src/components/Button.tsx:\n\nLine 45: export function Button({ variant = "primary", ... })\nLine 89: const buttonClasses = clsx(\nLine 120: return <button className={buttonClasses} ...',
  'Successfully created file at src/utils/helper.ts\n\nFile content:\nimport { formatDate } from "./date";\n\nexport function processData(input: any) {\n  // Implementation\n  return transformed;\n}',
  'Listed 12 items in directory /src/components:\n\nButton.tsx\nInput.tsx\nBadge.tsx\nDropdown.tsx\nIconButton.tsx\nPanel.tsx\nSidebar.tsx\nToggle.tsx\nTextarea.tsx\nRunEventsList.tsx\nRunEventDetails.tsx\nRunScreen.tsx',
  'Command executed successfully:\n\n$ npm run build\n\n> agyn-design@1.0.0 build\n> vite build\n\nvite v5.0.0 building for production...\n✓ 234 modules transformed.\ndist/index.html                   0.45 kB\ndist/assets/index-BwL4T8aI.css   12.34 kB\ndist/assets/index-D7K9mN2p.js    156.78 kB\n\n✓ built in 2.45s',
  'File read complete: 245 lines\n\nPath: /src/components/RunScreen.tsx\nSize: 8.4 KB\nLast modified: 2025-11-21 14:23:45\n\nContent preview:\nimport { useState } from "react";\nimport { Sidebar } from "../Sidebar";\nimport { RunEventsList } from "../RunEventsList";\n...',
  'String replacement completed successfully\n\nFile: src/styles/globals.css\nReplacements: 3\n\nOld: --agyn-blue: #0066FF;\nNew: --agyn-blue: #0070F3;\n\nChanges applied and file saved.',
  'Search returned 8 results for "useState":\n\n1. src/App.tsx:12 - const [route, setRoute] = useState("home");\n2. src/components/RunScreen.tsx:45 - const [selectedEvent, setSelectedEvent] = useState(null);\n3. src/components/Sidebar.tsx:23 - const [isCollapsed, setCollapsed] = useState(false);\n...',
];

// Sample context messages for LLM events
const SAMPLE_CONTEXTS = [
  [
    { role: 'system', content: 'You are a helpful AI assistant that helps developers write better code.' },
    { role: 'user', content: 'Can you review this React component and suggest improvements?' },
    { role: 'assistant', content: 'I\'d be happy to help! Please share the component code.' },
    { role: 'user', content: 'Here it is:\n\n```tsx\nfunction MyComponent() {\n  return <div>Hello</div>;\n}\n```' },
  ],
  [
    { role: 'system', content: 'You are an expert in software architecture and design patterns.' },
    { role: 'user', content: 'What\'s the best way to structure a large React application?' },
  ],
  [
    { role: 'system', content: 'You are a coding assistant specializing in TypeScript and modern web development.' },
    { role: 'user', content: 'How do I implement proper error handling in async functions?' },
    { role: 'assistant', content: 'There are several approaches to error handling in async functions. Let me explain the most common patterns...' },
  ],
];

// Generate a single event with realistic data
const generateEvent = (id: number, timestamp: Date): RunEvent => {
  const type = EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];
  const status = STATUSES[Math.floor(Math.random() * STATUSES.length)];
  const duration = status === 'pending' 
    ? undefined 
    : `${Math.floor(Math.random() * 3000) + 100}ms`;

  const baseEvent = {
    id: `event-${id}`,
    type,
    timestamp: timestamp.toISOString(),
    duration,
    status,
  };

  switch (type) {
    case 'message': {
      const messageSubtype = MESSAGE_SUBTYPES[Math.floor(Math.random() * MESSAGE_SUBTYPES.length)];
      return {
        ...baseEvent,
        data: {
          messageSubtype,
          content: SAMPLE_MESSAGES[Math.floor(Math.random() * SAMPLE_MESSAGES.length)],
        },
      };
    }
    case 'llm': {
      const model = LLM_MODELS[Math.floor(Math.random() * LLM_MODELS.length)];
      const context = SAMPLE_CONTEXTS[Math.floor(Math.random() * SAMPLE_CONTEXTS.length)];
      const input = SAMPLE_LLM_INPUTS[Math.floor(Math.random() * SAMPLE_LLM_INPUTS.length)];
      const output = SAMPLE_LLM_OUTPUTS[Math.floor(Math.random() * SAMPLE_LLM_OUTPUTS.length)];
      
      return {
        ...baseEvent,
        data: {
          model,
          input,
          output,
          context,
          response: output,
          tokens: {
            input: Math.floor(Math.random() * 500) + 100,
            output: Math.floor(Math.random() * 800) + 200,
            cached: Math.floor(Math.random() * 200),
            total: 0,
          },
        },
      };
    }
    case 'tool': {
      const toolName = TOOL_NAMES[Math.floor(Math.random() * TOOL_NAMES.length)];
      const toolSubtype = TOOL_SUBTYPES[Math.floor(Math.random() * TOOL_SUBTYPES.length)];
      const content = SAMPLE_TOOL_CONTENTS[Math.floor(Math.random() * SAMPLE_TOOL_CONTENTS.length)];
      
      // Generate input based on tool type
      let input = '';
      switch (toolName) {
        case 'read_file':
          input = '{\n  "filePath": "/src/components/Button.tsx",\n  "startLine": 1,\n  "endLine": 100\n}';
          break;
        case 'write_file':
          input = '{\n  "filePath": "/src/utils/helper.ts",\n  "content": "export function processData(input: any) { ... }"\n}';
          break;
        case 'grep_search':
          input = '{\n  "query": "useState",\n  "isRegexp": false,\n  "includePattern": "src/**/*.tsx"\n}';
          break;
        case 'run_in_terminal':
          input = '{\n  "command": "npm run build",\n  "explanation": "Building the project for production"\n}';
          break;
        default:
          input = `{\n  "operation": "${toolName}",\n  "parameters": { ... }\n}`;
      }
      
      return {
        ...baseEvent,
        data: {
          toolName,
          toolSubtype,
          content,
          input,
          output: content,
        },
      };
    }
    case 'summarization': {
      const summaryContent = 'Conversation summarized: Key points extracted and context preserved\n\n**Summary Points:**\n- User requested code review for React component\n- Assistant provided detailed feedback on component structure\n- Discussed performance optimization strategies\n- Covered error handling best practices\n\n**Context Preserved:**\n- Original component implementation\n- Suggested refactoring approach\n- Code examples and patterns';
      
      return {
        ...baseEvent,
        data: {
          content: summaryContent,
          summaryLength: Math.floor(Math.random() * 500) + 200,
          input: 'Previous 15 messages containing discussion about React component optimization',
          output: summaryContent,
        },
      };
    }
  }
};

// Generate sample events with realistic progression
const generateSampleEvents = (): RunEvent[] => {
  const events: RunEvent[] = [];
  const now = Date.now();
  
  // Generate 80 events with 5-second intervals
  for (let i = 0; i < 80; i++) {
    const timestamp = new Date(now - (79 - i) * 5000);
    events.push(generateEvent(i, timestamp));
  }
  
  return events;
};

interface RunScreenShowcaseProps {
  onBack?: () => void;
}

export default function RunScreenShowcase({ onBack }: RunScreenShowcaseProps) {
  const [events] = useState<RunEvent[]>(generateSampleEvents());
  const [runStatus] = useState<Status>('running');

  // Calculate statistics from events
  const statistics = {
    totalEvents: events.length,
    messages: events.filter(e => e.type === 'message').length,
    llm: events.filter(e => e.type === 'llm').length,
    tools: events.filter(e => e.type === 'tool').length,
    summaries: events.filter(e => e.type === 'summarization').length,
  };

  // Calculate token usage from LLM events
  const tokens = events
    .filter(e => e.type === 'llm' && e.data.tokens)
    .reduce((acc, e) => {
      const eventTokens = e.data.tokens!;
      return {
        input: acc.input + (eventTokens.input || 0),
        cached: acc.cached + (eventTokens.cached || 0),
        output: acc.output + (eventTokens.output || 0),
        reasoning: acc.reasoning,
        total: acc.total + (eventTokens.input || 0) + (eventTokens.output || 0),
      };
    }, { input: 0, cached: 0, output: 0, reasoning: 1250, total: 1250 });

  return (
    <RunScreen
      runId="run-abc123def456"
      status={runStatus}
      createdAt={new Date(Date.now() - 400000).toISOString()}
      duration="6m 40s"
      statistics={statistics}
      tokens={tokens}
      events={events}
      onTerminate={() => {
        console.log('Terminate run');
        alert('Run terminated');
      }}
      onBack={onBack}
    />
  );
}
