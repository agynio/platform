import { useState, type ReactNode } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

type JsonPrimitive = string | number | boolean | null;
type JsonObject = { [key: string]: JsonValue };
type JsonArray = JsonValue[];
type JsonValue = JsonPrimitive | JsonObject | JsonArray;

const isJsonArray = (value: JsonValue): value is JsonArray => Array.isArray(value);

const isJsonObject = (value: JsonValue): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

interface JsonViewerProps {
  data: JsonValue;
  className?: string;
}

export function JsonViewer({ data, className = '' }: JsonViewerProps) {
  // Expand all paths by default
  const getAllPaths = (obj: JsonValue, prefix = 'root'): string[] => {
    const paths = [prefix];
    if (isJsonArray(obj)) {
      obj.forEach((item, index) => {
        if (isJsonObject(item) || isJsonArray(item)) {
          paths.push(...getAllPaths(item, `${prefix}.${index}`));
        }
      });
    } else if (isJsonObject(obj)) {
      Object.entries(obj).forEach(([key, value]) => {
        if (isJsonObject(value) || isJsonArray(value)) {
          paths.push(...getAllPaths(value, `${prefix}.${key}`));
        }
      });
    }
    return paths;
  };

  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set(getAllPaths(data)));

  const togglePath = (path: string) => {
    const newExpanded = new Set(expandedPaths);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedPaths(newExpanded);
  };

  const isComplexValue = (val: JsonValue): boolean => {
    if (isJsonArray(val)) {
      return val.length > 0;
    }
    if (isJsonObject(val)) {
      return Object.keys(val).length > 0;
    }
    return false;
  };

  const renderValue = (value: JsonValue, path: string, depth = 0): ReactNode => {
    const indent = depth * 16;

    if (value === null) {
      return <span className="text-[var(--agyn-gray)]">null</span>;
    }

    if (value === undefined) {
      return <span className="text-[var(--agyn-gray)]">undefined</span>;
    }

    if (typeof value === 'boolean') {
      return <span className="text-[var(--agyn-purple)]">{value.toString()}</span>;
    }

    if (typeof value === 'number') {
      return <span className="text-[var(--agyn-cyan)]">{value}</span>;
    }

    if (typeof value === 'string') {
      const isMultiline = value.includes('\n');
      if (isMultiline) {
        return (
          <div className="text-[var(--agyn-green)] break-words mt-1" style={{ paddingLeft: `${indent + 16}px` }}>
            "{value}"
          </div>
        );
      }
      return (
        <span className="text-[var(--agyn-green)] break-words">
          "{value}"
        </span>
      );
    }

    if (isJsonArray(value)) {
      const isExpanded = expandedPaths.has(path);
      const isEmpty = value.length === 0;

      if (isEmpty) {
        return <span className="text-[var(--agyn-gray)]">[]</span>;
      }

      return (
        <span>
          <button
            onClick={() => togglePath(path)}
            className="inline-flex items-center gap-1 hover:bg-[var(--agyn-border-subtle)] rounded px-1 -mx-1"
          >
            {isExpanded ? (
              <ChevronDown className="w-3 h-3 text-[var(--agyn-gray)]" />
            ) : (
              <ChevronRight className="w-3 h-3 text-[var(--agyn-gray)]" />
            )}
            <span className="text-[var(--agyn-gray)] text-xs">Array ({value.length})</span>
          </button>
          {isExpanded && (
            <div>
              {value.map((item, index) => {
                const keyText = `${index}:`;
                const isComplex = isComplexValue(item);
                return (
                  <div key={index}>
                    {isComplex ? (
                      <div>
                        <div className="text-[var(--agyn-gray)]">{keyText}</div>
                        <div style={{ paddingLeft: '16px' }}>
                          {renderValue(item, `${path}.${index}`, depth)}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <span className="text-[var(--agyn-gray)]">{keyText}</span>
                        <div className="inline-block ml-3 align-top max-w-full">
                          {renderValue(item, `${path}.${index}`, depth)}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </span>
      );
    }

    if (isJsonObject(value)) {
      const isExpanded = expandedPaths.has(path);
      const entries = Object.entries(value);
      const keys = Object.keys(value);
      const isEmpty = keys.length === 0;

      if (isEmpty) {
        return <span className="text-[var(--agyn-gray)]">{'{}'}</span>;
      }

      return (
        <span>
          <button
            onClick={() => togglePath(path)}
            className="inline-flex items-center gap-1 hover:bg-[var(--agyn-border-subtle)] rounded px-1 -mx-1"
          >
            {isExpanded ? (
              <ChevronDown className="w-3 h-3 text-[var(--agyn-gray)]" />
            ) : (
              <ChevronRight className="w-3 h-3 text-[var(--agyn-gray)]" />
            )}
            <span className="text-[var(--agyn-gray)] text-xs">
              Object ({keys.length})
            </span>
          </button>
          {isExpanded && (
            <div>
              {entries.map(([key, childValue]) => {
                const keyText = `${key}:`;
                const isComplex = isComplexValue(childValue);
                return (
                  <div key={key}>
                    {isComplex ? (
                      <div>
                        <div className="text-[var(--agyn-blue)]">{keyText}</div>
                        <div style={{ paddingLeft: '16px' }}>
                          {renderValue(childValue, `${path}.${key}`, depth)}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <span className="text-[var(--agyn-blue)]">{keyText}</span>
                        <div className="inline-block ml-3 align-top max-w-full">
                          {renderValue(childValue, `${path}.${key}`, depth)}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </span>
      );
    }

    return <span>{String(value)}</span>;
  };

  return (
    <div className={`text-sm font-mono px-1 ${className}`}>
      {renderValue(data, 'root')}
    </div>
  );
}
