import { useState } from 'react';
import { ChevronRight, ChevronDown, Copy } from 'lucide-react';

interface JsonViewerProps {
  data: any;
  className?: string;
}

export function JsonViewer({ data, className = '' }: JsonViewerProps) {
  // Expand all paths by default
  const getAllPaths = (obj: any, prefix = 'root'): string[] => {
    const paths = [prefix];
    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        if (typeof item === 'object' && item !== null) {
          paths.push(...getAllPaths(item, `${prefix}.${index}`));
        }
      });
    } else if (typeof obj === 'object' && obj !== null) {
      Object.keys(obj).forEach(key => {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          paths.push(...getAllPaths(obj[key], `${prefix}.${key}`));
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

  const isComplexValue = (val: any): boolean => {
    return (Array.isArray(val) && val.length > 0) || (typeof val === 'object' && val !== null && Object.keys(val).length > 0);
  };

  const renderValue = (value: any, path: string, depth: number = 0, keyLength: number = 0): JSX.Element => {
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

    if (Array.isArray(value)) {
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
                          {renderValue(item, `${path}.${index}`, depth, 0)}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <span className="text-[var(--agyn-gray)]">{keyText}</span>
                        <div className="inline-block ml-3 align-top max-w-full">
                          {renderValue(item, `${path}.${index}`, depth, 0)}
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

    if (typeof value === 'object') {
      const isExpanded = expandedPaths.has(path);
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
              {keys.map((key) => {
                const keyText = `${key}:`;
                const isComplex = isComplexValue(value[key]);
                return (
                  <div key={key}>
                    {isComplex ? (
                      <div>
                        <div className="text-[var(--agyn-blue)]">{keyText}</div>
                        <div style={{ paddingLeft: '16px' }}>
                          {renderValue(value[key], `${path}.${key}`, depth, 0)}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <span className="text-[var(--agyn-blue)]">{keyText}</span>
                        <div className="inline-block ml-3 align-top max-w-full">
                          {renderValue(value[key], `${path}.${key}`, depth, 0)}
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
