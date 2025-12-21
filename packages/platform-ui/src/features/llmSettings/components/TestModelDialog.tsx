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
import { Dropdown } from '@/components/Dropdown';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel } from '@/components/forms/Form';
import type { ModelRecord } from '../types';

interface TestModelFormValues {
  mode: string;
  overrideModel: string;
  credentialName: string;
  input: string;
}

export interface TestModelDialogProps {
  open: boolean;
  model: ModelRecord;
  healthCheckModes: string[];
  healthCheckModesLoading: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: TestModelFormValues) => Promise<void> | void;
  submitting: boolean;
}

export function TestModelDialog({
  open,
  model,
  healthCheckModes,
  healthCheckModesLoading,
  submitting,
  onOpenChange,
  onSubmit,
}: TestModelDialogProps): ReactElement {
  const form = useForm<TestModelFormValues>({
    defaultValues: {
      mode: model.mode ?? 'chat',
      overrideModel: model.model,
      credentialName: model.credentialName,
      input: '',
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        mode: model.mode ?? 'chat',
        overrideModel: model.model,
        credentialName: model.credentialName,
        input: '',
      });
    }
  }, [open, model, form]);

  const handleSubmit = form.handleSubmit(async (values) => {
    await onSubmit({
      mode: values.mode,
      overrideModel: values.overrideModel.trim(),
      credentialName: values.credentialName.trim(),
      input: values.input,
    });
  });

  return (
    <ScreenDialog open={open} onOpenChange={onOpenChange}>
      <ScreenDialogContent className="sm:max-w-lg" hideCloseButton>
        <div className="flex items-start justify-between gap-4">
          <ScreenDialogHeader className="flex-1 gap-2">
            <ScreenDialogTitle>Test Model — {model.id}</ScreenDialogTitle>
            <ScreenDialogDescription>
              Run a LiteLLM health check for this model with optional overrides.
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
          <form id="llm-model-test-form" onSubmit={handleSubmit} className="mt-4 space-y-4">
            <FormField
              control={form.control}
              name="mode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mode</FormLabel>
                  <FormControl>
                    <Dropdown
                      value={field.value || undefined}
                      onValueChange={(value) => field.onChange(value)}
                      disabled={healthCheckModesLoading}
                      placeholder="Select mode"
                      options={healthCheckModes.map((modeOption) => ({ value: modeOption, label: modeOption }))}
                    />
                  </FormControl>
                  <FormDescription>Select LiteLLM request mode for test execution.</FormDescription>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="overrideModel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Override Provider Model</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder={model.model} />
                  </FormControl>
                  <FormDescription>Optional. Leave blank to use the configured provider model.</FormDescription>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="credentialName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Override Credential</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder={model.credentialName} />
                  </FormControl>
                  <FormDescription>Optional. Leave blank to use the configured credential.</FormDescription>
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
                  <FormDescription>Provide content for the test request. Leave empty to use a default prompt.</FormDescription>
                </FormItem>
              )}
            />
          </form>
        </Form>
        <ScreenDialogFooter className="mt-6">
          <Button variant="ghost" size="md" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="llm-model-test-form" variant="primary" size="md" disabled={submitting}>
            {submitting ? 'Testing…' : 'Run Test'}
          </Button>
        </ScreenDialogFooter>
      </ScreenDialogContent>
    </ScreenDialog>
  );
}
