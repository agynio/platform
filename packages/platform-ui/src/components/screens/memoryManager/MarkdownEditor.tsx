import { useCallback, useEffect, useState } from 'react';
import { FileText, Save } from 'lucide-react';

import { Button } from '../../Button';
import Badge from '../../Badge';
import { Textarea } from '../../Textarea';
import { cn } from '@/lib/utils';

type MarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  unsaved: boolean;
  className?: string;
};

export function MarkdownEditor({
  value,
  onChange,
  onSave,
  unsaved,
  className,
}: MarkdownEditorProps) {
  const [savedVisible, setSavedVisible] = useState(false);

  useEffect(() => {
    if (!savedVisible) return;
    const timer = window.setTimeout(() => setSavedVisible(false), 2000);
    return () => window.clearTimeout(timer);
  }, [savedVisible]);

  useEffect(() => {
    if (unsaved) setSavedVisible(false);
  }, [unsaved]);

  const handleSave = useCallback(() => {
    if (!unsaved) return;
    onSave();
    setSavedVisible(true);
  }, [onSave, unsaved]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  return (
    <div className={cn('flex h-full flex-col rounded-md border border-border bg-background', className)}>
      <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <span>Markdown Editor</span>
        </div>
        <div className="flex items-center gap-2">
          {unsaved && (
            <Badge variant="accent" className="uppercase tracking-wide">
              Unsaved changes
            </Badge>
          )}
          {savedVisible && !unsaved && (
            <Badge variant="secondary" className="uppercase tracking-wide">
              Saved
            </Badge>
          )}
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={handleSave}
            disabled={!unsaved}
            className="flex items-center gap-2"
          >
            <Save className="size-4" />
            Save
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden p-4">
        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Write markdown…"
          className="h-full min-h-[240px]"
        />
      </div>
      <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <FileText className="size-3.5" />
          <span>{value.trim().length > 0 ? `${value.length} characters` : 'No content yet'}</span>
        </div>
        <span>Press ⌘/Ctrl + S to save</span>
      </div>
    </div>
  );
}
