import {
  ScreenDialog,
  ScreenDialogContent,
  ScreenDialogDescription,
  ScreenDialogFooter,
  ScreenDialogHeader,
  ScreenDialogTitle,
} from '../../Dialog';
import { Button } from '../../ui/button';

type ConfirmDeleteDialogProps = {
  open: boolean;
  path: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDeleteDialog({ open, path, onConfirm, onCancel }: ConfirmDeleteDialogProps) {
  const targetLabel = path && path !== '/' ? path : 'this document';

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
        <ScreenDialogHeader>
          <ScreenDialogTitle>Delete memory node</ScreenDialogTitle>
          <ScreenDialogDescription>
            {`Are you sure you want to delete “${targetLabel}”? This will remove the document and all of its descendants.`}
          </ScreenDialogDescription>
        </ScreenDialogHeader>
        <ScreenDialogFooter className="mt-6">
          <Button type="button" variant="ghost" size="default" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" size="default" onClick={onConfirm}>
            Delete
          </Button>
        </ScreenDialogFooter>
      </ScreenDialogContent>
    </ScreenDialog>
  );
}
