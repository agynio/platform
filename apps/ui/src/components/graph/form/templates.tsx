import type { ReactNode } from 'react';

interface FieldTemplateProps { id: string; label?: string; required?: boolean; description?: ReactNode; errors?: ReactNode; children: ReactNode; }
export const FieldTemplate = (props: FieldTemplateProps) => {
  const { id, label, required, description, errors, children } = props;
  const isRoot = id === 'root';
  if (isRoot) return <div className="space-y-3">{children}</div>;
  return (
    <div className="space-y-1" key={id}>
  {label && <label htmlFor={id} className="mb-1 block text-[10px] uppercase text-muted-foreground">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>}
      {children}
      {description && <div className="mt-1 text-[10px] text-muted-foreground">{description}</div>}
      {errors}
    </div>
  );
};

interface ObjectFieldTemplateProps { idSchema?: { $id?: string }; properties?: Array<{ content: ReactNode }>; description?: ReactNode; errors?: ReactNode; }
export const ObjectFieldTemplate = (props: ObjectFieldTemplateProps) => {
  const isRoot = props.idSchema?.$id === 'root';
  return (
    <div className={isRoot ? 'space-y-3' : ''}>
      {props.properties?.map((p) => p.content)}
      {props.description}
      {props.errors}
    </div>
  );
};

export const templates = { FieldTemplate, ObjectFieldTemplate } as unknown as Record<string, unknown>;
