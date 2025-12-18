import { useEffect, type ReactElement } from 'react';
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
import { Input } from '@/components/Input';
import { Textarea } from '@/components/Textarea';
import { SelectInput } from '@/components/SelectInput';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/forms/Form';

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
    <ScreenDialog open={open} onOpenChange={onOpenChange}>
      <ScreenDialogContent className="sm:max-w-lg">
        <ScreenDialogHeader>
          <ScreenDialogTitle>Test Credential — {credentialName}</ScreenDialogTitle>
          <ScreenDialogDescription>
            Send a LiteLLM health check call using this credential and optional sample input.
          </ScreenDialogDescription>
        </ScreenDialogHeader>
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
                    <SelectInput
                      value={field.value}
                      onChange={(event) => field.onChange(event.target.value)}
                      disabled={healthCheckModesLoading}
                      placeholder="Select mode"
                      options={healthCheckModes.map((modeOption) => ({ value: modeOption, label: modeOption }))}
                    />
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
        <ScreenDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="llm-credential-test-form" disabled={submitting}>
            {submitting ? 'Testing…' : 'Run Test'}
          </Button>
        </ScreenDialogFooter>
      </ScreenDialogContent>
    </ScreenDialog>
  );
}
