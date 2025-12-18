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
      <ScreenDialogContent className="sm:max-w-lg">
        <ScreenDialogHeader>
          <ScreenDialogTitle>Test Model — {model.id}</ScreenDialogTitle>
          <ScreenDialogDescription>
            Run a LiteLLM health check for this model with optional overrides.
          </ScreenDialogDescription>
        </ScreenDialogHeader>
        <Form {...form}>
          <form id="llm-model-test-form" onSubmit={handleSubmit} className="space-y-4">
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
        <ScreenDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="llm-model-test-form" disabled={submitting}>
            {submitting ? 'Testing…' : 'Run Test'}
          </Button>
        </ScreenDialogFooter>
      </ScreenDialogContent>
    </ScreenDialog>
  );
}
