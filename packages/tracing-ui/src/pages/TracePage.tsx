import React from 'react';
import { useParams } from 'react-router-dom';
import { fetchTrace } from '../services/api';
import { SpanHierarchyPage } from './SpanHierarchyPage';

export function TracePage() {
  const { traceId } = useParams();
  if (!traceId) return <div style={{ padding: 16 }}>Missing traceId</div>;
  return <SpanHierarchyPage mode="trace" id={traceId} fetcher={fetchTrace} />;
}
