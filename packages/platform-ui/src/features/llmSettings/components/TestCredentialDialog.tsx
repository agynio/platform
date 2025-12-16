import { useEffect, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

interface TestCredentialFormValues {
  model: string;
  mode: string;
  input: string;
}

export interface TestCredentialDialogProps {
  open: boolean;
  credentialName: string;
  defaultModel?: string | null;
  healthCheckModes: string[];
  healthCheckModesLoading: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: TestCredentialFormValues) => Promise<void> | void;
  submitting: boolean;
}

export function TestCredentialDialog({
  open,
  credentialName,
  defaultModel,
  healthCheckModes,
  healthCheckModesLoading,
  submitting,
  onOpenChange,
  onSubmit,
}: TestCredentialDialogProps): ReactElement {
  const form = useForm<TestCredentialFormValues>({
    defaultValues: {
      model: defaultModel ?? '',
      mode: 'chat',
      input: '',
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({ model: defaultModel ?? '', mode: 'chat', input: '' });
    }
  }, [open, defaultModel, form]);

  const handleSubmit = form.handleSubmit(async (values) => {
    if (!values.model.trim()) {
      form.setError('model', { message: 'Model is required' });
      return;
    }
    await onSubmit({
      model: values.model.trim(),
      mode: values.mode,
      input: values.input,
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Test Credential — {credentialName}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form id="llm-credential-test-form" onSubmit={handleSubmit} className="space-y-4">
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
              name="mode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mode</FormLabel>
                  <FormControl>
                    <Select value={field.value} onValueChange={field.onChange} disabled={healthCheckModesLoading}>
                      <SelectTrigger disabled={healthCheckModesLoading}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {healthCheckModes.map((modeOption) => (
                          <SelectItem key={modeOption} value={modeOption}>
                            {modeOption}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormDescription>LiteLLM request mode for the test invocation.</FormDescription>
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
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="llm-credential-test-form" disabled={submitting}>
            {submitting ? 'Testing…' : 'Run Test'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
