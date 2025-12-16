import { useEffect, type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel } from '@/components/ui/form';
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Test Model — {model.id}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form id="llm-model-test-form" onSubmit={handleSubmit} className="space-y-4">
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
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="llm-model-test-form" disabled={submitting}>
            {submitting ? 'Testing…' : 'Run Test'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
