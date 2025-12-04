import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { buttonVariants } from '../ui/button-variants';

type ConfirmDeleteDialogProps = {
  open: boolean;
  path: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDeleteDialog({ open, path, onConfirm, onCancel }: ConfirmDeleteDialogProps) {
  const targetLabel = path && path !== '/' ? path : 'this document';

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onCancel();
        }
      }}
    >
      <AlertDialogContent className="max-w-[420px] rounded-[18px] border border-[var(--agyn-border-subtle)] bg-white p-6 shadow-[0px_32px_72px_-24px_rgba(15,23,42,0.45)]">
        <AlertDialogHeader className="space-y-2">
          <AlertDialogTitle className="text-lg font-semibold text-[var(--agyn-dark)]">Delete memory node</AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-relaxed text-[var(--agyn-text-subtle)]">
            {`Are you sure you want to delete “${targetLabel}”? This will remove the document and all of its descendants.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className={buttonVariants({ variant: 'destructive' })}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
