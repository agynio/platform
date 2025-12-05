export type MemoryNode = {
  id: string;
  path: string;
  name: string;
  content: string;
  children: MemoryNode[];
};

export type MemoryTree = MemoryNode;

export function cloneTree(node: MemoryNode): MemoryTree {
  return {
    ...node,
    content: node.content ?? '',
    children: node.children.map(cloneTree),
  };
}

export function normalizePath(path: string): string {
  if (!path || path === '/') return '/';
  const segments = path.split('/').filter((segment) => segment.length > 0);
  return segments.length === 0 ? '/' : `/${segments.join('/')}`;
}

export function joinPath(parentPath: string, childName: string): string {
  const normalizedParent = normalizePath(parentPath);
  const trimmedName = childName.trim();
  return normalizedParent === '/'
    ? `/${trimmedName}`
    : `${normalizedParent}/${trimmedName}`;
}

export function getParentPath(path: string): string | null {
  const normalized = normalizePath(path);
  if (normalized === '/') return null;
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length <= 1) return '/';
  segments.pop();
  return `/${segments.join('/')}`;
}

export function getAncestorPaths(path: string): string[] {
  const normalized = normalizePath(path);
  if (normalized === '/') return ['/'];
  const segments = normalized.split('/').filter(Boolean);
  const ancestors: string[] = ['/'];
  let current = '';
  for (const segment of segments) {
    current = `${current}/${segment}`;
    ancestors.push(normalizePath(current));
  }
  return ancestors;
}

export function findNodeByPath(tree: MemoryTree, targetPath: string): MemoryNode | null {
  const normalizedTarget = normalizePath(targetPath);
  if (tree.path === normalizedTarget) return tree;
  for (const child of tree.children) {
    const match = findNodeByPath(child, normalizedTarget);
    if (match) return match;
  }
  return null;
}

export function pathExists(tree: MemoryTree, path: string): boolean {
  return findNodeByPath(tree, path) != null;
}

export function addChild(tree: MemoryTree, parentPath: string, child: MemoryNode): MemoryTree {
  const normalizedParent = normalizePath(parentPath);
  const normalizedChildPath = normalizePath(child.path);
  const expectedPath = joinPath(normalizedParent, child.name);
  if (normalizedChildPath !== expectedPath) {
    throw new Error(`Child path ${normalizedChildPath} does not match expected ${expectedPath}`);
  }
  if (!pathExists(tree, normalizedParent)) {
    throw new Error(`Parent path ${normalizedParent} does not exist`);
  }
  if (pathExists(tree, normalizedChildPath)) {
    throw new Error(`Path ${normalizedChildPath} already exists`);
  }

  function insert(node: MemoryNode): MemoryNode {
    if (node.path === normalizedParent) {
      return {
        ...node,
        children: [...node.children, cloneTree(child)],
      };
    }

    let mutated = false;
    const nextChildren = node.children.map((current) => {
      const updated = insert(current);
      if (updated !== current) mutated = true;
      return updated;
    });

    return mutated ? { ...node, children: nextChildren } : node;
  }

  return insert(tree);
}

export function deleteNode(tree: MemoryTree, targetPath: string): MemoryTree {
  const normalizedTarget = normalizePath(targetPath);
  if (normalizedTarget === '/') {
    throw new Error('Cannot delete root node');
  }

  function remove(node: MemoryNode): MemoryNode {
    let mutated = false;
    const filteredChildren: MemoryNode[] = [];
    for (const child of node.children) {
      if (normalizePath(child.path) === normalizedTarget) {
        mutated = true;
        continue;
      }
      const updated = remove(child);
      if (updated !== child) mutated = true;
      filteredChildren.push(updated);
    }

    return mutated ? { ...node, children: filteredChildren } : node;
  }

  return remove(tree);
}

export function updateNodeContent(tree: MemoryTree, targetPath: string, content: string): MemoryTree {
  const normalizedTarget = normalizePath(targetPath);
  function update(node: MemoryNode): MemoryNode {
    if (node.path === normalizedTarget) {
      return {
        ...node,
        content,
      };
    }

    let mutated = false;
    const nextChildren = node.children.map((current) => {
      const updated = update(current);
      if (updated !== current) mutated = true;
      return updated;
    });

    return mutated ? { ...node, children: nextChildren } : node;
  }

  return update(tree);
}
