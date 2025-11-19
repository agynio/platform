type TracingDisabledProps = {
  title?: string;
  message?: string;
};

const DEFAULT_TITLE = 'Tracing unavailable';
const DEFAULT_MESSAGE = 'Tracing has been removed from the platform. Historical spans and realtime tracing views are no longer available.';

export function TracingDisabledPage({ title = DEFAULT_TITLE, message = DEFAULT_MESSAGE }: TracingDisabledProps) {
  return (
    <div className="p-6 space-y-3 max-w-xl">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground leading-relaxed">{message}</p>
      <p className="text-sm text-muted-foreground leading-relaxed">
        Runs continue to appear in the Threads and Timeline views. Refer to those pages for execution details.
      </p>
    </div>
  );
}
