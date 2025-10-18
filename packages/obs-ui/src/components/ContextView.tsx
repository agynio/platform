import React, { useMemo, useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface ContextMessageLike {
  role: string;
  content?: unknown;
  toolCalls?: unknown[];
  tool_calls?: unknown;
  toolCallId?: string;
  tool_call_id?: string;
  [k: string]: unknown;
}

export interface ContextViewProps {
  messages: ContextMessageLike[] | undefined | null;
  title?: string;
  /** If true (default) collapse history up to pivot AI message */
  collapse?: boolean;
  /** Optional style override */
  style?: React.CSSProperties;
}

/**
 * Reusable viewer for LLM context/chat messages with optional collapsing behavior.
 * Extracted from SpanDetails to allow reuse (e.g., summarize spans comparing old/new context).
 */
/**
 * ContextView renders a list of chat/LLM messages with an optional collapsing UX that
 * shows only the tail after the last AI message (to focus on the most recent human/tool inputs).
 * Provide messages as an array of objects each containing at least { role, content }.
 */
export function ContextView({ messages, title = 'Context', collapse = true, style }: ContextViewProps) {
  const contextMessages = Array.isArray(messages) ? messages : [];
  // Determine pivot AI index: normally last AI with something after it; if last AI is final message, pivot is previous AI.
  const pivotAiIndex = useMemo(() => {
    let indices: number[] = [];
    contextMessages.forEach((m, i) => {
      if ((m as ContextMessageLike)?.role === 'ai') indices.push(i);
    });
    if (indices.length === 0) return -1; // no AI => no collapse
    const last = indices[indices.length - 1];
    if (last === contextMessages.length - 1) {
      // last AI is final message; pick previous AI if present
      if (indices.length >= 2) return indices[indices.length - 2];
      return -1; // only one AI and it's final -> no collapse per spec
    }
    return last; // normal case
  }, [contextMessages]);

  const collapseEnabled = collapse && pivotAiIndex >= 0;
  const [historyCollapsed, setHistoryCollapsed] = useState<boolean>(collapseEnabled);
  useEffect(() => setHistoryCollapsed(collapseEnabled), [collapseEnabled]);
  const visibleMessageIndices = useMemo(() => {
    if (!historyCollapsed || !collapseEnabled) return contextMessages.map((_, i) => i);
    // show tail strictly after pivot AI index
    const arr: number[] = [];
    for (let i = pivotAiIndex + 1; i < contextMessages.length; i++) arr.push(i);
    return arr;
  }, [historyCollapsed, collapseEnabled, pivotAiIndex, contextMessages]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, ...style }}>
      {title && <h3 style={{ margin: '0 0 4px 0', fontSize: 13 }}>{title}</h3>}
      {contextMessages.length === 0 && <div style={{ fontSize: 12, color: '#666' }}>(empty)</div>}
      {collapseEnabled && historyCollapsed && (
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={() => setHistoryCollapsed(false)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#0366d6',
              fontSize: 11,
              textDecoration: 'underline',
              padding: '4px 8px',
            }}
          >
            {`Show previous (${pivotAiIndex + 1} hidden)`}
          </button>
        </div>
      )}
      {collapseEnabled &&
        historyCollapsed &&
        visibleMessageIndices.map((i) => {
          const m = contextMessages[i] as ContextMessageLike;
          return <MessageCard key={i} index={i} message={m} />;
        })}
      {!collapseEnabled &&
        contextMessages.map((m, i) => <MessageCard key={i} index={i} message={m as ContextMessageLike} />)}
      {collapseEnabled && !historyCollapsed && (
        <>
          {contextMessages.map((m, i) => (
            <React.Fragment key={i}>
              <MessageCard index={i} message={m as ContextMessageLike} />
              {i === pivotAiIndex && (
                <div style={{ textAlign: 'center', margin: '4px 0' }}>
                  <button
                    onClick={() => setHistoryCollapsed(true)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#555',
                      fontSize: 10,
                      textDecoration: 'underline',
                      padding: '2px 6px',
                    }}
                  >
                    Hide previous
                  </button>
                </div>
              )}
            </React.Fragment>
          ))}
        </>
      )}
    </div>
  );
}

function MessageCard({ message, index }: { message: ContextMessageLike; index: number }) {
  return (
    <div
      style={{
        background: '#f6f8fa',
        border: '1px solid #e1e4e8',
        borderRadius: 4,
        padding: 8,
        fontSize: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <RoleBadge role={message.role} />
        <span style={{ fontSize: 10, color: '#555' }}>#{index + 1}</span>
        {Array.isArray(message.toolCalls) && message.toolCalls.length > 0 && (
          <span
            style={{
              fontSize: 10,
              background: '#0366d6',
              color: '#fff',
              padding: '2px 6px',
              borderRadius: 10,
            }}
          >
            {message.toolCalls.length} tool calls
          </span>
        )}
      </div>
      <div style={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-word' }}>
        <ReactMarkdown
          className="obs-md"
          className="obs-md"
          remarkPlugins={[remarkGfm]}
          components={{
            code({ className, children, ...props }) {
              const isBlock = String(className || '').includes('language-') || String(children).includes('\n');
              return (
                <code
                  style={{
                    background: '#eaeef2',
                    padding: isBlock ? 8 : '2px 4px',
                    display: isBlock ? 'block' : 'inline',
                    borderRadius: 4,
                    fontSize: 11,
                    whiteSpace: 'pre-wrap',
                  }}
                  className={className}
                  {...props}
                >
                  {children}
                </code>
              );
            },
            pre({ children }) {
              return <pre style={{ background: '#eaeef2', padding: 0, margin: 0, overflow: 'auto' }}>{children}</pre>;
            },
          }}
        >
          {String(message.content ?? '')}
        </ReactMarkdown>
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    system: '#6a737d',
    human: '#22863a',
    ai: '#0366d6',
    tool: '#8250df',
  };
  return (
    <span
      style={{
        background: colors[role] || '#444',
        color: '#fff',
        padding: '2px 6px',
        borderRadius: 12,
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}
    >
      {role}
    </span>
  );
}

export default ContextView;
