import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { GitBranch, ArrowLeft, PanelLeftClose, PanelRightClose, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import FileExplorer from '@/components/workspace/FileExplorer';
import CodeViewer from '@/components/workspace/CodeViewer';
import AiPanel from '@/components/workspace/AiPanel';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import type { SessionState, Repository, Session } from '@/lib/types';

const Workspace = () => {
  const navigate = useNavigate();
  const { repoId } = useParams();
  const { user } = useAuth();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [openFiles, setOpenFiles] = useState<string[]>([]);
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [sessionState, setSessionState] = useState<SessionState>('IDLE');
  const [showExplorer, setShowExplorer] = useState(true);
  const [showAiPanel, setShowAiPanel] = useState(true);
  const [repo, setRepo] = useState<Repository | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [repoTree, setRepoTree] = useState<{ path: string; size: number }[]>([]);

  useEffect(() => {
    if (!user) { navigate('/'); return; }
    loadRepo();
  }, [user, repoId, navigate]);

  const loadRepo = async () => {
    if (!user || !repoId) return;
    try {
      const { repositories } = await api.listRepos(user.id);
      const found = repositories.find(r => r.id === repoId);
      if (found) {
        setRepo(found);
        // Use findOrCreate to reuse existing chat session
        const { session } = await api.findOrCreateSession(found.id, 'chat');
        setSession(session);
        setSessionState(session.state as SessionState);

        // Fetch repo tree for auto-context
        try {
          const { files } = await api.fetchTree(user.id, found.owner, found.name);
          setRepoTree(files);
        } catch (e) {
          console.error('Failed to fetch tree:', e);
        }
      }
    } catch (e) {
      console.error('Failed to load workspace:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = useCallback(async (path: string) => {
    setSelectedFile(path);
    setOpenFiles(prev => prev.includes(path) ? prev : [...prev, path]);

    // Fetch file content if not cached
    if (!fileContents[path] && user && repo) {
      try {
        const { content } = await api.fetchFile(user.id, repo.owner, repo.name, path);
        setFileContents(prev => ({ ...prev, [path]: content }));
      } catch (e) {
        console.error('Failed to fetch file:', e);
        setFileContents(prev => ({ ...prev, [path]: `// Error loading file: ${e}` }));
      }
    }
  }, [fileContents, user, repo]);

  const handleCloseTab = useCallback((path: string) => {
    setOpenFiles(prev => {
      const next = prev.filter(p => p !== path);
      if (selectedFile === path) {
        setSelectedFile(next[next.length - 1] || null);
      }
      return next;
    });
  }, [selectedFile]);

  const handleStateChange = useCallback(async (newState: SessionState) => {
    if (session) {
      try {
        const { session: updated } = await api.transitionState(session.id, newState);
        setSession(updated);
        setSessionState(updated.state as SessionState);
      } catch (e) {
        console.error('State transition failed:', e);
      }
    } else {
      setSessionState(newState);
    }
  }, [session]);

  const handleFileContentsUpdate = useCallback((updates: Record<string, string>) => {
    setFileContents(prev => ({ ...prev, ...updates }));
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-border bg-card/50 px-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>
          <div className="flex items-center gap-2 text-xs">
            <GitBranch className="h-3.5 w-3.5 text-primary" />
            <span className="font-mono text-foreground">
              {repo ? `${repo.owner}/${repo.name}` : 'Loading...'}
            </span>
            <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {repo?.default_branch || 'main'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <StateIndicatorCompact state={sessionState} />
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setShowExplorer(!showExplorer)}>
            <PanelLeftClose className={`h-3.5 w-3.5 transition-default ${!showExplorer ? 'opacity-40' : ''}`} />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setShowAiPanel(!showAiPanel)}>
            <PanelRightClose className={`h-3.5 w-3.5 transition-default ${!showAiPanel ? 'opacity-40' : ''}`} />
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {showExplorer && (
          <div className="w-60 shrink-0 border-r border-border animate-slide-in-right">
            <FileExplorer
              onFileSelect={handleFileSelect}
              selectedFile={selectedFile}
              userId={user?.id}
              repo={repo}
            />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <CodeViewer
            openFiles={openFiles}
            activeFile={selectedFile}
            onSelectTab={setSelectedFile}
            onCloseTab={handleCloseTab}
            fileContents={fileContents}
          />
        </div>

        {showAiPanel && (
          <div className="w-80 shrink-0 border-l border-border animate-slide-in-right">
            <AiPanel
              sessionState={sessionState}
              onStateChange={handleStateChange}
              session={session}
              repo={repo}
              userId={user?.id || ''}
              openFiles={openFiles}
              fileContents={fileContents}
              onFileContentsUpdate={handleFileContentsUpdate}
              repoTree={repoTree}
            />
          </div>
        )}
      </div>
    </div>
  );
};
  const navigate = useNavigate();
  const { repoId } = useParams();
  const { user } = useAuth();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [openFiles, setOpenFiles] = useState<string[]>([]);
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [sessionState, setSessionState] = useState<SessionState>('IDLE');
  const [showExplorer, setShowExplorer] = useState(true);
  const [showAiPanel, setShowAiPanel] = useState(true);
  const [repo, setRepo] = useState<Repository | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { navigate('/'); return; }
    loadRepo();
  }, [user, repoId, navigate]);

  const loadRepo = async () => {
    if (!user || !repoId) return;
    try {
      const { repositories } = await api.listRepos(user.id);
      const found = repositories.find(r => r.id === repoId);
      if (found) {
        setRepo(found);
        // Create a session for this repo
        const { session } = await api.createSession(found.id, 'chat');
        setSession(session);
        setSessionState(session.state as SessionState);
      }
    } catch (e) {
      console.error('Failed to load workspace:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = useCallback(async (path: string) => {
    setSelectedFile(path);
    setOpenFiles(prev => prev.includes(path) ? prev : [...prev, path]);

    // Fetch file content if not cached
    if (!fileContents[path] && user && repo) {
      try {
        const { content } = await api.fetchFile(user.id, repo.owner, repo.name, path);
        setFileContents(prev => ({ ...prev, [path]: content }));
      } catch (e) {
        console.error('Failed to fetch file:', e);
        setFileContents(prev => ({ ...prev, [path]: `// Error loading file: ${e}` }));
      }
    }
  }, [fileContents, user, repo]);

  const handleCloseTab = useCallback((path: string) => {
    setOpenFiles(prev => {
      const next = prev.filter(p => p !== path);
      if (selectedFile === path) {
        setSelectedFile(next[next.length - 1] || null);
      }
      return next;
    });
  }, [selectedFile]);

  const handleStateChange = useCallback(async (newState: SessionState) => {
    if (session) {
      try {
        const { session: updated } = await api.transitionState(session.id, newState);
        setSession(updated);
        setSessionState(updated.state as SessionState);
      } catch (e) {
        console.error('State transition failed:', e);
      }
    } else {
      setSessionState(newState);
    }
  }, [session]);

  const handleFileContentsUpdate = useCallback((updates: Record<string, string>) => {
    setFileContents(prev => ({ ...prev, ...updates }));
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-border bg-card/50 px-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>
          <div className="flex items-center gap-2 text-xs">
            <GitBranch className="h-3.5 w-3.5 text-primary" />
            <span className="font-mono text-foreground">
              {repo ? `${repo.owner}/${repo.name}` : 'Loading...'}
            </span>
            <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {repo?.default_branch || 'main'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <StateIndicatorCompact state={sessionState} />
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setShowExplorer(!showExplorer)}>
            <PanelLeftClose className={`h-3.5 w-3.5 transition-default ${!showExplorer ? 'opacity-40' : ''}`} />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setShowAiPanel(!showAiPanel)}>
            <PanelRightClose className={`h-3.5 w-3.5 transition-default ${!showAiPanel ? 'opacity-40' : ''}`} />
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {showExplorer && (
          <div className="w-60 shrink-0 border-r border-border animate-slide-in-right">
            <FileExplorer
              onFileSelect={handleFileSelect}
              selectedFile={selectedFile}
              userId={user?.id}
              repo={repo}
            />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <CodeViewer
            openFiles={openFiles}
            activeFile={selectedFile}
            onSelectTab={setSelectedFile}
            onCloseTab={handleCloseTab}
            fileContents={fileContents}
          />
        </div>

        {showAiPanel && (
          <div className="w-80 shrink-0 border-l border-border animate-slide-in-right">
            <AiPanel
              sessionState={sessionState}
              onStateChange={handleStateChange}
              session={session}
              repo={repo}
              userId={user?.id || ''}
              openFiles={openFiles}
              fileContents={fileContents}
              onFileContentsUpdate={handleFileContentsUpdate}
            />
          </div>
        )}
      </div>
    </div>
  );
};

const StateIndicatorCompact = ({ state }: { state: SessionState }) => {
  const colors: Record<SessionState, string> = {
    IDLE: 'bg-muted-foreground',
    PLANNING: 'bg-lime-300',
    SPEC_LOCKED: 'bg-green-300',
    EXECUTING: 'bg-lime-400 animate-pulse-glow',
    VALIDATING: 'bg-green-400 animate-pulse-glow',
    DONE: 'bg-emerald-500',
    FAILED: 'bg-destructive',
  };

  return (
    <div className="flex items-center gap-1.5 rounded bg-secondary/50 px-2 py-1 mr-2">
      <div className={`h-1.5 w-1.5 rounded-full ${colors[state]}`} />
      <span className="text-[10px] font-mono text-muted-foreground">{state}</span>
    </div>
  );
};

export default Workspace;
