import { useEffect, useMemo, useRef, useState } from 'react';
import { userEvent, waitForElementToBeRemoved, within } from '@storybook/testing-library';
import type { Meta, StoryObj } from '@storybook/react';

import { MemoryManager } from '../src/components/screens/memoryManager/MemoryManager';
import type { MemoryTree, MemoryNode } from '../src/components/screens/memoryManager/utils';
import { getParentPath, joinPath, normalizePath } from '../src/components/screens/memoryManager/utils';
import { withMainLayout } from './decorators/withMainLayout';

const ROOT_PATH = '/' as const;

type MemoryNodeOption = {
  key: string;
  nodeId: string;
  scope: 'global' | 'perThread';
  threadId?: string;
  label: string;
};

type DumpResponse = {
  nodeId: string;
  scope: 'global' | 'perThread';
  threadId?: string;
  data: Record<string, string>;
  dirs: Record<string, true>;
};

type DocumentState = {
  loading: boolean;
  exists: boolean;
  error: string | null;
};

function ensureNode(map: Map<string, MemoryNode>, root: MemoryTree, path: string): MemoryNode {
  const normalized = normalizePath(path);
  if (normalized === ROOT_PATH) return root;
  if (map.has(normalized)) return map.get(normalized)!;

  const parentPath = getParentPath(normalized) ?? ROOT_PATH;
  const parent = ensureNode(map, root, parentPath);
  const name = normalized.split('/').filter(Boolean).pop() ?? normalized;
  const node: MemoryNode = {
    id: normalized,
    path: normalized,
    name,
    content: '',
    children: [],
  };
  parent.children.push(node);
  map.set(normalized, node);
  return node;
}

function sortTree(node: MemoryNode): void {
  node.children.sort((a, b) => a.name.localeCompare(b.name));
  for (const child of node.children) sortTree(child);
}

function buildTreeFromDump(label: string, dump: DumpResponse): MemoryTree {
  const root: MemoryTree = {
    id: 'root',
    path: ROOT_PATH,
    name: label,
    content: dump.data[ROOT_PATH] ?? '',
    children: [],
  };

  const nodeMap = new Map<string, MemoryNode>();

  for (const dirPath of Object.keys(dump.dirs)) {
    ensureNode(nodeMap, root, dirPath);
  }

  for (const [dataPath, content] of Object.entries(dump.data)) {
    if (dataPath === ROOT_PATH) continue;
    const node = ensureNode(nodeMap, root, dataPath);
    node.content = content;
  }

  sortTree(root);
  return root;
}

function cloneDump(dump: DumpResponse): DumpResponse {
  return {
    nodeId: dump.nodeId,
    scope: dump.scope,
    threadId: dump.threadId,
    data: { ...dump.data },
    dirs: { ...dump.dirs },
  };
}

const SAMPLE_NODES: MemoryNodeOption[] = [
  {
    key: 'alpha::global',
    nodeId: 'alpha',
    scope: 'global',
    label: 'alpha (global)',
  },
  {
    key: 'alpha::thread::customer-onboarding',
    nodeId: 'alpha',
    scope: 'perThread',
    threadId: 'customer-onboarding',
    label: 'alpha (thread: customer-onboarding)',
  },
];

const INITIAL_DUMPS: Record<string, DumpResponse> = {
  'alpha::global': {
    nodeId: 'alpha',
    scope: 'global',
    data: {
      '/': '# Alpha (global)\n\nShared announcements and team-wide notes.',
      '/glossary': 'Terms and definitions used by the org.',
      '/glossary/faq': 'Frequently asked questions and responses.',
      '/launch-checklist': '- Prepare release notes\n- Notify stakeholders\n- Monitor metrics',
    },
    dirs: {
      '/glossary': true,
    },
  },
  'alpha::thread::customer-onboarding': {
    nodeId: 'alpha',
    scope: 'perThread',
    threadId: 'customer-onboarding',
    data: {
      '/': '# Customer onboarding thread\n\nTrack the latest updates for the onboarding program.',
      '/meeting-notes': 'Kickoff call notes with action items.',
      '/questions/open': 'List of open questions awaiting answers.',
    },
    dirs: {
      '/questions': true,
    },
  },
};

const meta: Meta<typeof MemoryManager> = {
  title: 'Screens/MemoryManager',
  component: MemoryManager,
  decorators: [withMainLayout],
  parameters: {
    layout: 'fullscreen',
    selectedMenuItem: 'graph',
  },
  tags: ['!autodocs'],
};

export default meta;

type Story = StoryObj<typeof meta>;

const InteractiveTemplate = () => {
  const [nodeDumps, setNodeDumps] = useState<Record<string, DumpResponse>>(() =>
    Object.fromEntries(Object.entries(INITIAL_DUMPS).map(([key, dump]) => [key, cloneDump(dump)])),
  );
  const [selectedNodeKey, setSelectedNodeKey] = useState<string>(SAMPLE_NODES[0].key);
  const storedPathsRef = useRef<Map<string, string>>(new Map());
  const [selectedPath, setSelectedPath] = useState<string>(ROOT_PATH);
  const [editorValue, setEditorValue] = useState('');
  const [baselineValue, setBaselineValue] = useState('');

  const selectedNode = useMemo(() => SAMPLE_NODES.find((node) => node.key === selectedNodeKey) ?? null, [selectedNodeKey]);
  const currentDump = selectedNode ? nodeDumps[selectedNode.key] : null;

  useEffect(() => {
    if (!selectedNode) return;
    const stored = storedPathsRef.current.get(selectedNode.key) ?? ROOT_PATH;
    setSelectedPath(stored);
  }, [selectedNode]);

  useEffect(() => {
    if (!selectedNode || !currentDump) {
      setEditorValue('');
      setBaselineValue('');
      return;
    }
    const normalized = normalizePath(selectedPath);
    const content = normalized === ROOT_PATH ? '' : currentDump.data[normalized] ?? '';
    setEditorValue(content);
    setBaselineValue(content);
  }, [currentDump, selectedNode, selectedPath]);

  const tree = useMemo<MemoryTree | null>(() => {
    if (!selectedNode || !currentDump) return null;
    return buildTreeFromDump(selectedNode.label, currentDump);
  }, [currentDump, selectedNode]);

  const handleSelectNode = useCallback((key: string) => {
    setSelectedNodeKey(key);
  }, []);

  const handleSelectPath = useCallback(
    (path: string) => {
      if (!selectedNode) return;
      const normalized = normalizePath(path);
      storedPathsRef.current.set(selectedNode.key, normalized);
      setSelectedPath(normalized);
    },
    [selectedNode],
  );

  const updateDump = useCallback(
    (updater: (dump: DumpResponse) => DumpResponse) => {
      if (!selectedNode) return;
      setNodeDumps((previous) => ({
        ...previous,
        [selectedNode.key]: updater(cloneDump(previous[selectedNode.key])),
      }));
    },
    [selectedNode],
  );

  const handleCreateDirectory = useCallback(
    (parentPath: string, name: string) => {
      if (!selectedNode) return;
      const targetPath = joinPath(parentPath, name);
      updateDump((dump) => {
        dump.dirs[targetPath] = true;
        return dump;
      });
      storedPathsRef.current.set(selectedNode.key, targetPath);
      setSelectedPath(targetPath);
      setEditorValue('');
      setBaselineValue('');
    },
    [selectedNode, updateDump],
  );

  const handleDeletePath = useCallback(
    (path: string) => {
      if (!selectedNode || !currentDump) return;
      const normalized = normalizePath(path);
      const prefix = `${normalized}/`;
      updateDump((dump) => {
        for (const key of Object.keys(dump.data)) {
          if (key === normalized || key.startsWith(prefix)) {
            delete dump.data[key];
          }
        }
        for (const dir of Object.keys(dump.dirs)) {
          if (dir === normalized || dir.startsWith(prefix)) {
            delete dump.dirs[dir];
          }
        }
        return dump;
      });
      const parent = getParentPath(normalized) ?? ROOT_PATH;
      storedPathsRef.current.set(selectedNode.key, parent);
      setSelectedPath(parent);
      setEditorValue('');
      setBaselineValue('');
    },
    [currentDump, selectedNode, updateDump],
  );

  const handleSave = useCallback(() => {
    if (!selectedNode || !currentDump) return;
    const normalized = normalizePath(selectedPath);
    if (normalized === ROOT_PATH) return;
    updateDump((dump) => {
      dump.data[normalized] = editorValue;
      return dump;
    });
    setBaselineValue(editorValue);
  }, [currentDump, editorValue, selectedNode, selectedPath, updateDump]);

  const docState: DocumentState = {
    loading: false,
    exists: selectedPath !== ROOT_PATH && Boolean(currentDump?.data[selectedPath]),
    error: null,
  };

  const canSave = selectedPath !== ROOT_PATH && editorValue !== baselineValue;

  return (
    <div className="h-[720px]">
      <MemoryManager
        nodes={SAMPLE_NODES}
        selectedNodeKey={selectedNodeKey}
        onSelectNode={handleSelectNode}
        nodeSelectDisabled={false}
        tree={tree}
        treeLoading={false}
        disableInteractions={!selectedNode}
        selectedPath={selectedPath}
        onSelectPath={handleSelectPath}
        onCreateDirectory={handleCreateDirectory}
        onDeletePath={handleDeletePath}
        editorValue={editorValue}
        onEditorChange={setEditorValue}
        canSave={canSave}
        onSave={handleSave}
        isSaving={false}
        mutationError={null}
        docState={docState}
        emptyTreeMessage="No documents for this node yet. Create one to get started."
        noNodesMessage="No memory nodes found."
      />
    </div>
  );
};

export const InteractivePlayground: Story = {
  render: () => <InteractiveTemplate />,
  parameters: {
    docs: {
      description: {
        story:
          'Switch between memory nodes, create nested directories, edit document content, and delete nodes to preview the Memory Manager experience.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const nodeSelector = await canvas.findByRole('combobox', { name: /select memory node/i });
    await userEvent.click(nodeSelector);
    const portal = within(canvasElement.ownerDocument.body);
    await userEvent.click(await portal.findByRole('option', { name: /thread: customer-onboarding/i }));
    await canvas.findByText(/customer-onboarding/i);

    const addButton = await canvas.findByRole('button', { name: /add subdocument/i });
    await userEvent.click(addButton);
    const nameField = await canvas.findByLabelText(/name/i);
    await userEvent.clear(nameField);
    await userEvent.type(nameField, 'weekly-summary');
    await userEvent.click(await canvas.findByRole('button', { name: /^create$/i }));
    await canvas.findByRole('treeitem', { name: /weekly-summary/i });

    const deleteButton = await canvas.findByRole('button', { name: /delete document/i });
    await userEvent.click(deleteButton);
    const dialog = await within(canvasElement.ownerDocument.body).findByRole('dialog', { name: /delete memory node/i });
    await userEvent.click(within(dialog).getByRole('button', { name: /^cancel$/i }));
    await waitForElementToBeRemoved(() => within(canvasElement.ownerDocument.body).queryByRole('dialog', { name: /delete memory node/i }));
  },
};
