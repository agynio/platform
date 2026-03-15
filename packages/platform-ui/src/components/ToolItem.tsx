import { useRef, useEffect, useMemo, useState } from 'react';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';

interface ToolItemProps {
  name: string;
  description?: string;
}

export function ToolItem({ name, description }: ToolItemProps) {
  const nameRef = useRef<HTMLDivElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);
  const trimmedDescription = useMemo(() => {
    const value = typeof description === 'string' ? description.trim() : '';
    return value.length > 0 ? value : null;
  }, [description]);

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
    <div className="p-3 border border-[var(--agyn-border-default)] rounded-[10px] bg-[var(--agyn-bg-light)]">
      <div className="min-w-0">
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
        {trimmedDescription && (
          <div className="text-xs text-[var(--agyn-gray)] mt-0.5">
            {trimmedDescription}
          </div>
        )}
      </div>
    </div>
  );
}
