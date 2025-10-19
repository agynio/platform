import React from 'react';
import { useParams } from 'react-router-dom';
import { fetchThread } from '../services/api';
import { SpanHierarchyPage } from './SpanHierarchyPage';

export function ThreadPage() {
  const { threadId } = useParams();
  if (!threadId) return <div style={{ padding: 16 }}>Missing threadId</div>;
  return <SpanHierarchyPage mode="thread" id={threadId} fetcher={fetchThread} />;
}
