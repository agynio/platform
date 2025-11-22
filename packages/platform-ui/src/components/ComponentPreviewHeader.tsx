import { ArrowLeft } from 'lucide-react';

interface ComponentPreviewHeaderProps {
  title: string;
  description: string;
  onBack: () => void;
}

export default function ComponentPreviewHeader({ title, description, onBack }: ComponentPreviewHeaderProps) {
  return (
    <div className="mb-8">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-[var(--agyn-gray)] hover:text-[var(--agyn-blue)] mb-4 transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
        <span>Back to Components</span>
      </button>
      <h1 className="mb-2">{title}</h1>
      <p className="text-[var(--agyn-gray)]">{description}</p>
    </div>
  );
}
