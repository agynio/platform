import { useEffect, type ReactElement } from 'react';
import { X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import {
  ScreenDialog,
  ScreenDialogContent,
  ScreenDialogDescription,
  ScreenDialogFooter,
  ScreenDialogHeader,
  ScreenDialogTitle,
} from '@/components/Dialog';
import { Button } from '@/components/Button';
import { IconButton } from '@/components/IconButton';
import { Input } from '@/components/Input';
import { Textarea } from '@/components/Textarea';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/forms/Form';

interface TestCredentialFormValues {
  model: string;
  input: string;
}

export interface TestCredentialDialogProps {
  open: boolean;
  credentialName: string;
  defaultModel?: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: TestCredentialFormValues) => Promise<void> | void;
  submitting: boolean;
}

export function TestCredentialDialog({
  open,
  credentialName,
  defaultModel,
  submitting,
  onOpenChange,
  onSubmit,
}: TestCredentialDialogProps): ReactElement {
  const form = useForm<TestCredentialFormValues>({
    defaultValues: {
      model: defaultModel ?? '',
      input: '',
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({ model: defaultModel ?? '', input: '' });
    }
  }, [open, defaultModel, form]);

  const handleSubmit = form.handleSubmit(async (values) => {
    if (!values.model.trim()) {
      form.setError('model', { message: 'Model is required' });
      return;
    }
    await onSubmit({
      model: values.model.trim(),
      input: values.input,
    });
  });

  return (
    <ScreenDialog open={open} onOpenChange={onOpenChange}>
      <ScreenDialogContent className="sm:max-w-lg" hideCloseButton>
        <div className="flex items-start justify-between gap-4">
          <ScreenDialogHeader className="flex-1 gap-2">
            <ScreenDialogTitle>Test Credential — {credentialName}</ScreenDialogTitle>
            <ScreenDialogDescription>
              Send a LiteLLM health check call using this credential and optional sample input.
            </ScreenDialogDescription>
          </ScreenDialogHeader>
          <IconButton
            icon={<X className="h-4 w-4" />}
            variant="ghost"
            size="sm"
            rounded={false}
            aria-label="Close dialog"
            title="Close"
            className="shrink-0"
            onClick={() => onOpenChange(false)}
          />
        </div>
        <Form {...form}>
          <form id="llm-credential-test-form" onSubmit={handleSubmit} className="mt-4 space-y-4">
            <FormField
              control={form.control}
              name="model"
              rules={{ required: 'Model identifier required' }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Model</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder={defaultModel ?? 'gpt-4o-mini'} />
                  </FormControl>
                  <FormDescription>Enter a model identifier that this credential should access.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="input"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sample Input (optional)</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder="Hello there" className="min-h-[120px]" />
                  </FormControl>
                  <FormDescription>
                    Provide sample content to send with the test request. Leave blank to send a default prompt.
                  </FormDescription>
                </FormItem>
              )}
            />
          </form>
        </Form>
        <ScreenDialogFooter className="mt-6">
          <Button variant="ghost" size="md" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="llm-credential-test-form" variant="primary" size="md" disabled={submitting}>
            {submitting ? 'Testing…' : 'Run Test'}
          </Button>
        </ScreenDialogFooter>
      </ScreenDialogContent>
    </ScreenDialog>
  );
}
