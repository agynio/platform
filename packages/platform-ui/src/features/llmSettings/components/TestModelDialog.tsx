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
import { Textarea } from '@/components/Textarea';
import { Dropdown } from '@/components/Dropdown';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel } from '@/components/forms/Form';
import type { LiteLLMHealthResponse } from '@/api/modules/llmSettings';
import type { ModelRecord } from '../types';
import { TestModelResultView, type TestModelErrorState } from './TestModelResultView';

interface TestModelFormValues {
  mode: string;
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
  resultView?: {
    visible: boolean;
    status?: 'success' | 'error';
    result?: LiteLLMHealthResponse;
    error?: TestModelErrorState;
    onBack?: () => void;
    onClose: () => void;
  };
}

export function TestModelDialog({
  open,
  model,
  healthCheckModes,
  healthCheckModesLoading,
  submitting,
  onOpenChange,
  onSubmit,
  resultView,
}: TestModelDialogProps): ReactElement {
  const form = useForm<TestModelFormValues>({
    defaultValues: {
      mode: model.mode ?? 'chat',
      input: '',
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        mode: model.mode ?? 'chat',
        input: '',
      });
    }
  }, [open, model, form]);

  const handleSubmit = form.handleSubmit(async (values) => {
    await onSubmit({
      mode: values.mode,
      input: values.input,
    });
  });

  const showResultView = Boolean(resultView?.visible && resultView.status);
  const successResult = resultView?.status === 'success';
  const dialogTitle = showResultView ? `Test Result — ${model.id}` : `Test Model — ${model.id}`;
  const dialogDescription = showResultView
    ? successResult
      ? 'LiteLLM connection succeeded.'
      : 'LiteLLM reported an error during testing.'
    : 'Run a LiteLLM health check for this model.';

  const handleDialogClose = () => {
    if (showResultView && resultView) {
      resultView.onClose();
      return;
    }
    onOpenChange(false);
  };

  return (
    <ScreenDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          handleDialogClose();
        } else {
          onOpenChange(next);
        }
      }}
    >
      <ScreenDialogContent className="sm:max-w-lg" hideCloseButton>
        <div className="flex items-start justify-between gap-4">
          <ScreenDialogHeader className="flex-1 gap-2">
            <ScreenDialogTitle>{dialogTitle}</ScreenDialogTitle>
            <ScreenDialogDescription>{dialogDescription}</ScreenDialogDescription>
          </ScreenDialogHeader>
          <IconButton
            icon={<X className="h-4 w-4" />}
            variant="ghost"
            size="sm"
            rounded={false}
            aria-label="Close dialog"
            title="Close"
            className="shrink-0"
            onClick={handleDialogClose}
          />
        </div>

        {showResultView && resultView ? (
          <div className="mt-6">
            <TestModelResultView result={resultView.result} error={resultView.error} />
          </div>
        ) : (
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
        )}

        <ScreenDialogFooter className="mt-6">
          {showResultView && resultView ? (
            <>
              {resultView.onBack ? (
                <Button variant="ghost" size="md" onClick={() => resultView.onBack?.()}>
                  Back to test
                </Button>
              ) : null}
              <Button variant="primary" size="md" onClick={() => resultView.onClose()}>
                Close
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="md" onClick={handleDialogClose} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" form="llm-model-test-form" variant="primary" size="md" disabled={submitting}>
                {submitting ? 'Testing…' : 'Run Test'}
              </Button>
            </>
          )}
        </ScreenDialogFooter>
      </ScreenDialogContent>
    </ScreenDialog>
  );
}
