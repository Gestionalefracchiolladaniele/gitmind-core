import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GitBranch, Plus, Clock, ArrowRight, LogOut, Database, Trash2, Search, Loader2, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAuth } from '@/lib/auth';
import { Loader2 as Spinner } from 'lucide-react';
import { api } from '@/lib/api';
import type { Repository, GitHubRepo } from '@/lib/types';

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, isLoading: authLoading, logout } = useAuth();
  const [repos, setRepos] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAttach, setShowAttach] = useState(false);
  const [ghRepos, setGhRepos] = useState<GitHubRepo[]>([]);
  const [ghLoading, setGhLoading] = useState(false);
  const [ghSearch, setGhSearch] = useState('');
  const [attaching, setAttaching] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate('/'); return; }
    loadRepos();
  }, [user, authLoading, navigate]);

  const loadRepos = async () => {
    if (!user) return;
    try {
      const { repositories } = await api.listRepos(user.id);
      setRepos(repositories);
    } catch (e) {
      console.error('Failed to load repos:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadGitHubRepos = async () => {
    if (!user) return;
    if (!user.github_id) {
      // Simulated user - no real GitHub connection
      setGhRepos([]);
      return;
    }
    setGhLoading(true);
    try {
      const { repos } = await api.listGitHubRepos(user.id);
      setGhRepos(repos);
    } catch (e) {
      console.error('Failed to load GitHub repos:', e);
    } finally {
      setGhLoading(false);
    }
  };

  const handleAttach = async (ghRepo: GitHubRepo) => {
    if (!user) return;
    setAttaching(ghRepo.full_name);
    try {
      await api.attachRepo(user.id, ghRepo.owner, ghRepo.name);
      await loadRepos();
      setShowAttach(false);
    } catch (e: any) {
      console.error('Failed to attach:', e);
    } finally {
      setAttaching(null);
    }
  };

  const handleDelete = async (repoId: string) => {
    if (!user) return;
    try {
      await api.deleteRepo(repoId, user.id);
      setRepos(prev => prev.filter(r => r.id !== repoId));
    } catch (e) {
      console.error('Failed to delete:', e);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const filteredGhRepos = ghRepos.filter(r =>
    r.full_name.toLowerCase().includes(ghSearch.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <GitBranch className="h-5 w-5 text-primary" />
            <span className="font-mono font-semibold text-foreground">Danspace AI</span>
          </div>
          <div className="flex items-center gap-2">
            {user && (
              <span className="text-xs text-muted-foreground font-mono mr-2">{user.name}</span>
            )}
            <div className="flex items-center gap-2 rounded-lg bg-secondary/50 px-3 py-1.5 text-xs text-muted-foreground">
              <Database className="h-3 w-3" />
              <span>{repos.length}/50 repos</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/settings')}>
              <Settings className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Repositories</h1>
            <p className="mt-1 text-sm text-muted-foreground">Select a repository to open the workspace</p>
          </div>
          <Dialog open={showAttach} onOpenChange={(open) => { setShowAttach(open); if (open) loadGitHubRepos(); }}>
            <DialogTrigger asChild>
              <Button disabled={repos.length >= 50} size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Attach Repository
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Attach GitHub Repository</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={ghSearch}
                    onChange={e => setGhSearch(e.target.value)}
                    placeholder="Search repositories..."
                    className="pl-9"
                  />
                </div>
                <div className="max-h-80 overflow-y-auto space-y-2 scrollbar-thin">
                  {ghLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : filteredGhRepos.length === 0 ? (
                    <p className="text-center text-sm text-muted-foreground py-8">
                      {ghRepos.length === 0 ? 'No GitHub repos found. Make sure your GitHub token has repo access.' : 'No matching repositories.'}
                    </p>
                  ) : (
                    filteredGhRepos.map(r => (
                      <button
                        key={r.id}
                        onClick={() => handleAttach(r)}
                        disabled={attaching === r.full_name || repos.some(lr => lr.owner === r.owner && lr.name === r.name)}
                        className="w-full flex items-center justify-between rounded-lg border border-border p-3 text-left hover:bg-secondary/30 transition-default disabled:opacity-50"
                      >
                        <div>
                          <p className="text-sm font-mono text-foreground">{r.full_name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {r.private ? '🔒 Private' : '🌐 Public'} · {r.default_branch}
                          </p>
                        </div>
                        {attaching === r.full_name ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : repos.some(lr => lr.owner === r.owner && lr.name === r.name) ? (
                          <span className="text-xs text-muted-foreground">Attached</span>
                        ) : null}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : repos.length === 0 ? (
          <div className="text-center py-20">
            <GitBranch className="mx-auto h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">No repositories attached yet.</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Click "Attach Repository" to connect a GitHub repo.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {repos.map((repo, i) => (
              <div
                key={repo.id}
                className="group glass-panel rounded-xl p-5 text-left transition-default hover:border-primary/30 hover:bg-panel-hover animate-fade-in relative"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <button
                  onClick={() => navigate(`/workspace/${repo.id}`)}
                  className="w-full text-left"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <GitBranch className="h-5 w-5 text-primary" />
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-default group-hover:opacity-100" />
                  </div>
                  <h3 className="font-mono text-sm font-medium text-foreground">
                    {repo.owner}/{repo.name}
                  </h3>
                  <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <GitBranch className="h-3 w-3" />
                      {repo.default_branch}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(repo.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(repo.id); }}
                  className="absolute top-3 right-3 p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-destructive/10 transition-default"
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
