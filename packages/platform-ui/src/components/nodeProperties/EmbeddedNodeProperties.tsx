import { memo } from 'react';

import { NodePropertiesContent, type NodePropertiesContentProps } from './NodePropertiesContent';

export interface EmbeddedNodePropertiesProps extends NodePropertiesContentProps {
  className?: string;
}

function EmbeddedNodePropertiesBase({ className, ...contentProps }: EmbeddedNodePropertiesProps) {
  if (className) {
    return (
      <div className={className}>
        <NodePropertiesContent {...contentProps} />
      </div>
    );
  }

  return <NodePropertiesContent {...contentProps} />;
}

export const EmbeddedNodeProperties = memo(EmbeddedNodePropertiesBase);
