import { useRef, useEffect, useState } from 'react';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';
import { Toggle } from './Toggle';

interface ToolItemProps {
  name: string;
  description: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

export function ToolItem({ name, description, enabled, onToggle }: ToolItemProps) {
  const nameRef = useRef<HTMLDivElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    const checkTruncation = () => {
      if (nameRef.current) {
        setIsTruncated(nameRef.current.scrollWidth > nameRef.current.clientWidth);
      }
    };

    checkTruncation();
    window.addEventListener('resize', checkTruncation);
    return () => window.removeEventListener('resize', checkTruncation);
  }, [name]);

  const nameElement = (
    <div 
      ref={nameRef}
      className="text-sm text-[var(--agyn-dark)] truncate"
    >
      {name}
    </div>
  );

  return (
    <div className="flex items-start justify-between p-3 border border-[var(--agyn-border-default)] rounded-[10px] bg-[var(--agyn-bg-light)]">
      <div className="flex-1 min-w-0 mr-3">
        {isTruncated ? (
          <Tooltip>
            <TooltipTrigger className="w-full text-left">
              {nameElement}
            </TooltipTrigger>
            <TooltipContent>
              <p>{name}</p>
            </TooltipContent>
          </Tooltip>
        ) : (
          nameElement
        )}
        <div className="text-xs text-[var(--agyn-gray)] mt-0.5">
          {description}
        </div>
      </div>
      <div className="flex-shrink-0">
        <Toggle
          label=""
          description=""
          checked={enabled}
          onCheckedChange={onToggle}
        />
      </div>
    </div>
  );
}
