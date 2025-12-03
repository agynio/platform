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

type ConfirmDeleteDialogProps = {
  open: boolean;
  path: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDeleteDialog({ open, path, onConfirm, onCancel }: ConfirmDeleteDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete memory node</AlertDialogTitle>
          <AlertDialogDescription>
            {`Are you sure you want to delete “${path ?? ''}”? This will remove the node and all of its descendants.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-200"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
