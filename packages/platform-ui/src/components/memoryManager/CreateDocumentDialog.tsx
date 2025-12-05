import { type FormEvent, useEffect, useId, useMemo, useState } from 'react';

import { Button } from '../Button';
import {
  ScreenDialog,
  ScreenDialogContent,
  ScreenDialogDescription,
  ScreenDialogFooter,
  ScreenDialogHeader,
  ScreenDialogTitle,
} from '../screens/Dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

type CreateDocumentDialogProps = {
  open: boolean;
  parentPath: string | null;
  onCancel: () => void;
  onCreate: (name: string) => void;
  validateName: (name: string) => string | null;
};

export function CreateDocumentDialog({ open, parentPath, onCancel, onCreate, validateName }: CreateDocumentDialogProps) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName('');
    setTouched(false);
  }, [open, parentPath]);

  const errorMessage = useMemo(() => {
    if (!touched) return null;
    return validateName(name);
  }, [name, touched, validateName]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched(true);
    const validationError = validateName(name);
    if (validationError) return;
    onCreate(name.trim());
  };

  const parentLabel = parentPath && parentPath !== '/' ? `“${parentPath}”` : 'the root';

  const disableCreate = Boolean(validateName(name));

  return (
    <ScreenDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onCancel();
        }
      }}
    >
      <ScreenDialogContent>
        <ScreenDialogHeader className="space-y-1.5">
          <ScreenDialogTitle>Create subdocument</ScreenDialogTitle>
          <ScreenDialogDescription>
            Documents created here will appear under {parentLabel}.
          </ScreenDialogDescription>
        </ScreenDialogHeader>
        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor={inputId}>Name</Label>
            <Input
              id={inputId}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (!touched) {
                  setTouched(true);
                }
              }}
              onBlur={() => setTouched(true)}
              placeholder="Document name"
              aria-invalid={errorMessage ? 'true' : undefined}
              aria-describedby={errorMessage ? errorId : undefined}
              autoFocus
            />
            {errorMessage ? (
              <p id={errorId} className="text-sm text-destructive">
                {errorMessage}
              </p>
            ) : null}
          </div>
          <ScreenDialogFooter>
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={disableCreate}>
              Create
            </Button>
          </ScreenDialogFooter>
        </form>
      </ScreenDialogContent>
    </ScreenDialog>
  );
}
