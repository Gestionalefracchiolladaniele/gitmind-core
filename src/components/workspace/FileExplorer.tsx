import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, File, Folder, Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import type { FileNode, Repository } from '@/lib/types';

interface FileExplorerProps {
  onFileSelect: (path: string) => void;
  selectedFile: string | null;
  userId?: string;
  repo?: Repository | null;
}

function buildTree(files: { path: string; size: number; sha: string }[]): FileNode[] {
  const root: FileNode[] = [];
  const map = new Map<string, FileNode>();

  for (const file of files) {
    const parts = file.path.split('/');
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${name}` : name;
      const isFile = i === parts.length - 1;

      if (!map.has(currentPath)) {
        const ext = name.split('.').pop() || '';
        const langMap: Record<string, string> = { ts: 'ts', tsx: 'tsx', js: 'js', jsx: 'jsx', json: 'json', md: 'md', css: 'css', html: 'html', py: 'py' };
        const node: FileNode = {
          name,
          path: currentPath,
          type: isFile ? 'file' : 'folder',
          children: isFile ? undefined : [],
          language: isFile ? langMap[ext] : undefined,
          sha: isFile ? file.sha : undefined,
          size: isFile ? file.size : undefined,
        };
        map.set(currentPath, node);

        if (parentPath && map.has(parentPath)) {
          map.get(parentPath)!.children!.push(node);
        } else if (!parentPath) {
          root.push(node);
        }
      }
    }
  }

  return root;
}

const FileExplorer = ({ onFileSelect, selectedFile, userId, repo }: FileExplorerProps) => {
  const [search, setSearch] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [tree, setTree] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (userId && repo) {
      loadTree();
    }
  }, [userId, repo]);

  const loadTree = async () => {
    if (!userId || !repo) return;
    setLoading(true);
    setError(null);
    try {
      const { files } = await api.fetchTree(userId, repo.owner, repo.name, repo.default_branch, repo.base_path || undefined);
      const built = buildTree(files);
      setTree(built);
      // Auto-expand first level
      const firstLevel = new Set(built.filter(n => n.type === 'folder').map(n => n.path));
      setExpandedFolders(firstLevel);
    } catch (e: any) {
      setError(e.message);
      console.error('Failed to load file tree:', e);
    } finally {
      setLoading(false);
    }
  };

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const filterTree = (nodes: FileNode[], query: string): FileNode[] => {
    if (!query) return nodes;
    return nodes.reduce<FileNode[]>((acc, node) => {
      if (node.type === 'file' && node.name.toLowerCase().includes(query.toLowerCase())) {
        acc.push(node);
      } else if (node.type === 'folder' && node.children) {
        const filtered = filterTree(node.children, query);
        if (filtered.length > 0) acc.push({ ...node, children: filtered });
      }
      return acc;
    }, []);
  };

  const filteredTree = filterTree(tree, search);

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="border-b border-border p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search files..."
            className="h-8 pl-8 text-xs bg-secondary/50 border-border"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin p-1">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="p-3 text-xs text-destructive">{error}</div>
        ) : filteredTree.length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground">No files found</div>
        ) : (
          filteredTree.map(node => (
            <TreeNode
              key={node.path}
              node={node}
              depth={0}
              expanded={expandedFolders}
              onToggle={toggleFolder}
              onSelect={onFileSelect}
              selectedFile={selectedFile}
            />
          ))
        )}
      </div>
    </div>
  );
};

const TreeNode: React.FC<{
  node: FileNode; depth: number; expanded: Set<string>;
  onToggle: (path: string) => void; onSelect: (path: string) => void; selectedFile: string | null;
}> = ({
  node, depth, expanded, onToggle, onSelect, selectedFile,
}) => {
  const isExpanded = expanded.has(node.path);
  const isSelected = node.path === selectedFile;
  const isFolder = node.type === 'folder';

  const langColor: Record<string, string> = {
    tsx: 'text-blue-400', ts: 'text-blue-300', json: 'text-yellow-400', md: 'text-muted-foreground',
    js: 'text-yellow-300', jsx: 'text-blue-400', css: 'text-pink-400', py: 'text-green-400',
  };

  return (
    <>
      <button
        onClick={() => isFolder ? onToggle(node.path) : onSelect(node.path)}
        className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-default hover:bg-secondary/50 ${
          isSelected ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {isFolder ? (
          isExpanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <span className="w-3.5" />
        )}
        {isFolder ? (
          <Folder className="h-3.5 w-3.5 shrink-0 text-primary/60" />
        ) : (
          <File className={`h-3.5 w-3.5 shrink-0 ${langColor[node.language || ''] || 'text-muted-foreground'}`} />
        )}
        <span className="truncate font-mono">{node.name}</span>
      </button>
      {isFolder && isExpanded && node.children?.map(child => (
        <TreeNode
          key={child.path}
          node={child}
          depth={depth + 1}
          expanded={expanded}
          onToggle={onToggle}
          onSelect={onSelect}
          selectedFile={selectedFile}
        />
      ))}
    </>
  );
};

export default FileExplorer;
