import { useState, useEffect, useRef } from 'react';
import { Button } from './Button';

interface FullscreenBashEditorProps {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  label?: string;
}

export function FullscreenBashEditor({ 
  value, 
  onChange, 
  onClose,
  label = 'Bash Editor'
}: FullscreenBashEditorProps) {
  const [localValue, setLocalValue] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  useEffect(() => {
    // Focus the textarea when mounted
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  const handleSave = () => {
    onChange(localValue);
    onClose();
  };

  const handleCancel = () => {
    setLocalValue(value);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle Tab key for indentation
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = e.currentTarget as HTMLTextAreaElement;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newValue = localValue.substring(0, start) + '  ' + localValue.substring(end);
      setLocalValue(newValue);
      
      // Set cursor position after the inserted spaces
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-[10px] w-full h-full max-w-[1400px] max-h-[900px] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--agyn-border-subtle)]">
          <div>
            <h3 className="text-[var(--agyn-dark)]">{label}</h3>
            <p className="text-sm text-[var(--agyn-gray)] mt-1">
              Edit your bash script in fullscreen mode
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSave}>
              Save Changes
            </Button>
          </div>
        </div>

        {/* Editor Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="px-6 py-3 border-b border-[var(--agyn-border-subtle)] bg-[var(--agyn-bg-light)]">
            <h4 className="text-sm text-[var(--agyn-dark)]">Bash Script Editor</h4>
          </div>
          <textarea
            ref={textareaRef}
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 p-6 resize-none focus:outline-none font-mono text-sm text-[var(--agyn-dark)] bg-white leading-relaxed"
            placeholder="#!/bin/bash&#10;&#10;# Start writing your bash script here..."
            spellCheck={false}
            style={{
              tabSize: 2,
            }}
          />
        </div>
      </div>
    </div>
  );
}