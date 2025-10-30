import { describe, it, expect } from vitest;
import { ThreadLockService } from ../src/graph/nodes/agent/threadLock.service;

// Unit tests for ThreadLockService semantics

describe(ThreadLockService, () => {
  it(serializes
