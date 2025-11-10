import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@agyn/ui';

type ThreadSelectorProps = {
  threads: string[];
  value?: string | null;
  onChange: (threadId: string) => void;
};

export function ThreadSelector({ threads, value, onChange }: ThreadSelectorProps) {
  if (!threads.length) {
    return <div className="text-sm text-muted-foreground">No threads found</div>;
  }

  return (
    <div className="space-y-1">
      <Label htmlFor="memory-thread-selector">Thread</Label>
      <Select
        value={value ?? undefined}
        onValueChange={(next) => {
          onChange(next);
        }}
      >
        <SelectTrigger id="memory-thread-selector" className="w-full">
          <SelectValue placeholder="Select thread" />
        </SelectTrigger>
        <SelectContent>
          {threads.map((threadId) => (
            <SelectItem key={threadId} value={threadId}>
              {threadId}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
