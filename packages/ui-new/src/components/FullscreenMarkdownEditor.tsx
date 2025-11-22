import { useState, useEffect } from 'react';
import { X, Eye, Code, SplitSquareVertical } from 'lucide-react';
import { Button } from './Button';
import { SegmentedControl } from './SegmentedControl';

interface FullscreenMarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  label?: string;
}

type ViewMode = 'split' | 'edit' | 'preview';

export function FullscreenMarkdownEditor({ 
  value, 
  onChange, 
  onClose,
  label = 'Editor'
}: FullscreenMarkdownEditorProps) {
  const [localValue, setLocalValue] = useState(value);
  const [viewMode, setViewMode] = useState<ViewMode>('split');

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  useEffect(() => {
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const handleSave = () => {
    onChange(localValue);
    onClose();
  };

  const handleCancel = () => {
    setLocalValue(value);
    onClose();
  };

  // Simple markdown to HTML converter (basic implementation)
  const renderMarkdown = (text: string) => {
    let html = text;
    
    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    
    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Italic
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Code blocks
    html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    
    // Inline code
    html = html.replace(/`(.*?)`/g, '<code>$1</code>');
    
    // Links
    html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    
    // Line breaks
    html = html.replace(/\n/g, '<br />');
    
    // Lists
    html = html.replace(/^\* (.*$)/gim, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    
    return html;
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-[10px] w-full h-full max-w-[1400px] max-h-[900px] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--agyn-border-subtle)]">
          <div>
            <h3 className="text-[var(--agyn-dark)]">{label}</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">
              Edit your content with live markdown preview
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {/* View Mode Toggles */}
            <SegmentedControl
              items={[
                { value: 'edit', label: 'Edit', icon: <Code className="w-4 h-4" />, title: 'Edit Only' },
                { value: 'split', label: 'Split', icon: <SplitSquareVertical className="w-4 h-4" />, title: 'Split View' },
                { value: 'preview', label: 'Preview', icon: <Eye className="w-4 h-4" />, title: 'Preview Only' }
              ]}
              value={viewMode}
              onChange={(newValue) => setViewMode(newValue as ViewMode)}
            />
            
            <div className="w-px h-6 bg-[var(--agyn-border-subtle)]" />
            
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSave}>
              Save Changes
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Editor Panel */}
          {(viewMode === 'edit' || viewMode === 'split') && (
            <div className={`${viewMode === 'split' ? 'w-1/2' : 'w-full'} flex flex-col border-r border-[var(--agyn-border-subtle)]`}>
              <div className="px-6 py-3 border-b border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)]">
                <h4 className="text-sm text-[var(--agyn-dark)]">Markdown Editor</h4>
              </div>
              <textarea
                value={localValue}
                onChange={(e) => setLocalValue(e.target.value)}
                className="flex-1 p-6 resize-none focus:outline-none font-mono text-sm text-[var(--agyn-dark)] bg-white"
                placeholder="Start typing your markdown here..."
                spellCheck={false}
              />
            </div>
          )}

          {/* Preview Panel */}
          {(viewMode === 'preview' || viewMode === 'split') && (
            <div className={`${viewMode === 'split' ? 'w-1/2' : 'w-full'} flex flex-col`}>
              <div className="px-6 py-3 border-b border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)]">
                <h4 className="text-sm text-[var(--agyn-dark)]">Preview</h4>
              </div>
              <div className="flex-1 p-6 overflow-auto bg-white">
                <div 
                  className="prose prose-sm max-w-none markdown-preview"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(localValue) }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}