-- Add developer role for context items
ALTER TYPE "ContextItemRole" ADD VALUE IF NOT EXISTS 'developer';

-- Add developer message kind
ALTER TYPE "MessageKind" ADD VALUE IF NOT EXISTS 'developer';
