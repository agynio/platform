import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const MonacoEditor = lazy(() => import('@monaco-editor/react'));

const markdownComponents: Components = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
};

export interface PromptEditorModalProps {
  open: boolean;
  value: string;
  onClose: () => void;
  onSave: (next: string) => void;
  readOnly?: boolean;
}

export function PromptEditorModal({ open, value, onClose, onSave, readOnly }: PromptEditorModalProps) {
  const [draft, setDraft] = useState<string>(value ?? '');
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(value ?? '');
    } else {
      setConfirmOpen(false);
    }
  }, [open, value]);

  const isDirty = useMemo(() => draft !== (value ?? ''), [draft, value]);

  const closeWithMaybeConfirm = useCallback(() => {
    if (isDirty && !readOnly) {
      setConfirmOpen(true);
      return;
    }
    onClose();
  }, [isDirty, onClose, readOnly]);

  const handleDialogOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        closeWithMaybeConfirm();
      }
    },
    [closeWithMaybeConfirm],
  );

  const handleCancel = useCallback(() => {
    closeWithMaybeConfirm();
  }, [closeWithMaybeConfirm]);

  const handleDiscard = useCallback(() => {
    setConfirmOpen(false);
    onClose();
  }, [onClose]);

  const handleSave = useCallback(() => {
    onSave(draft ?? '');
  }, [draft, onSave]);

  const editorOptions = useMemo(
    () => ({
      wordWrap: 'on' as const,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
    }),
    [],
  );

  return (
    <>
      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent
          className="w-[95vw] max-w-[95vw] h-[90vh] p-0 overflow-hidden flex flex-col gap-0"
          data-testid="prompt-modal"
        >
          <DialogHeader className="flex-none border-b border-border px-6 py-4">
            <DialogTitle>Edit system prompt</DialogTitle>
            <DialogDescription>Update the prompt in a larger editor view.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-hidden bg-background">
            <div className="grid h-full grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
              <div className="flex flex-col bg-muted/10">
                <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading editor…</div>}>
                  {open ? (
                    <MonacoEditor
                      value={draft}
                      onChange={(nextValue) => setDraft(nextValue ?? '')}
                      language="markdown"
                      theme="vs-light"
                      options={{ ...editorOptions, readOnly: !!readOnly }}
                      loading={null}
                      height="100%"
                      width="100%"
                    />
                  ) : null}
                </Suspense>
              </div>
              <div className="flex flex-col overflow-hidden bg-background">
                <div className="flex items-center justify-between border-b border-border px-4 py-2 text-xs uppercase text-muted-foreground">Live preview</div>
                <div className="flex-1 overflow-auto px-6 py-4 text-sm" data-testid="prompt-preview">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {draft || '*No content*'}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="flex flex-row items-center justify-end gap-2 border-t border-border px-6 py-4">
            <Button variant="ghost" onClick={handleCancel} data-testid="prompt-modal-cancel">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={readOnly} data-testid="prompt-modal-save">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>Your edits will be lost if you close without saving.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={handleDiscard}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default PromptEditorModal;
