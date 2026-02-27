import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Zap, MessageSquare, Play, Loader2, Bot, CheckCircle, AlertTriangle, RotateCcw, FileCode, GitCommit } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import type { SessionState, Session, Repository } from '@/lib/types';

interface DbMessage {
  id: string;
  session_id: string;
  role: string;
  content: string;
  file_context: Record<string, string> | null;
  created_at: string;
}

interface PendingPatch {
  file: string;
  content: string;
}

// Client-side protected files — must never be committed via AI
const CLIENT_PROTECTED_FILES = new Set([
  '.env', 'package.json', 'package-lock.json', 'yarn.lock', 'bun.lockb',
  'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json',
  'vite.config.ts', 'vite.config.js',
  'tailwind.config.ts', 'tailwind.config.js',
  'postcss.config.js', 'postcss.config.cjs',
  'eslint.config.js', 'components.json', 'index.html',
  '.gitignore', 'supabase/config.toml',
]);
const CLIENT_PROTECTED_PATTERNS = [/\.env\./, /\.lock$/, /\.lockb$/, /supabase\/migrations\//, /\.lovable\//];

function isClientProtectedFile(path: string): boolean {
  const name = path.split('/').pop() || '';
  if (CLIENT_PROTECTED_FILES.has(name) || CLIENT_PROTECTED_FILES.has(path)) return true;
  return CLIENT_PROTECTED_PATTERNS.some(p => p.test(path));
}

// Relevant file extensions for auto-context
const RELEVANT_EXTENSIONS = ['.tsx', '.ts', '.css', '.jsx', '.js'];
const MAX_AUTO_CONTEXT_FILES = 8;
const MAX_AUTO_FILE_SIZE = 50000; // 50KB

interface AiPanelProps {
  sessionState: SessionState;
  onStateChange: (state: SessionState) => void;
  session: Session | null;
  repo: Repository | null;
  userId: string;
  openFiles: string[];
  fileContents: Record<string, string>;
  onFileContentsUpdate?: (updates: Record<string, string>) => void;
  repoTree?: { path: string; size: number }[];
}

const AiPanel = ({ sessionState, onStateChange, session, repo, userId, openFiles, fileContents, onFileContentsUpdate, repoTree }: AiPanelProps) => {
  const [messages, setMessages] = useState<DbMessage[]>([]);
  const [input, setInput] = useState('');
  const [actionInput, setActionInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isChatting, setIsChatting] = useState(false);
  const [executionResult, setExecutionResult] = useState<{ patches: string; commitMessage: string } | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [pendingPatches, setPendingPatches] = useState<{ msgIdx: number; patches: PendingPatch[]; commitMessage: string } | null>(null);
  const [applyingPatches, setApplyingPatches] = useState(false);
  const [revertDialog, setRevertDialog] = useState<{ messageId: string; fileContext: Record<string, string> } | null>(null);
  const [reverting, setReverting] = useState(false);
  const [pipelineState, setPipelineState] = useState<SessionState>('IDLE');
  const [autoContextFiles, setAutoContextFiles] = useState<Record<string, string>>({});
  const [loadingAutoContext, setLoadingAutoContext] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Load chat history on session change
  useEffect(() => {
    if (!session) return;
    setLoadingHistory(true);
    api.getChatMessages(session.id)
      .then(({ messages: msgs }) => {
        if (msgs.length === 0) {
          const welcomeContent = 'Ciao! Sono il tuo assistente AI. Posso aiutarti con il codice del tuo progetto. Chiedi pure!';
          api.saveChatMessage(session.id, 'assistant', welcomeContent).then(({ message }) => {
            setMessages([message]);
          });
        } else {
          setMessages(msgs);
        }
      })
      .catch(console.error)
      .finally(() => setLoadingHistory(false));
  }, [session?.id]);

  // Auto-fetch relevant files from repo tree when no files are open
  useEffect(() => {
    if (!repoTree || repoTree.length === 0 || !repo || !userId) return;
    // Only auto-fetch if no files are manually opened
    if (openFiles.length > 0) return;

    const relevantFiles = repoTree
      .filter(f => {
        const ext = '.' + f.path.split('.').pop();
        return RELEVANT_EXTENSIONS.includes(ext) && 
               f.path.startsWith('src/') && 
               f.size < MAX_AUTO_FILE_SIZE &&
               !f.path.includes('node_modules') &&
               !f.path.includes('.test.') &&
               !f.path.includes('.spec.');
      })
      .sort((a, b) => {
        // Prioritize: pages > components > lib > hooks > other
        const priority = (p: string) => {
          if (p.includes('/pages/')) return 0;
          if (p.includes('/components/') && !p.includes('/ui/')) return 1;
          if (p.includes('/lib/')) return 2;
          if (p.includes('/hooks/')) return 3;
          return 4;
        };
        return priority(a.path) - priority(b.path);
      })
      .slice(0, MAX_AUTO_CONTEXT_FILES);

    if (relevantFiles.length === 0) return;

    setLoadingAutoContext(true);
    Promise.all(
      relevantFiles.map(f => 
        api.fetchFile(userId, repo.owner, repo.name, f.path)
          .then(({ content }) => ({ path: f.path, content }))
          .catch(() => null)
      )
    ).then(results => {
      const ctx: Record<string, string> = {};
      results.forEach(r => {
        if (r) ctx[r.path] = r.content;
      });
      setAutoContextFiles(ctx);
    }).finally(() => setLoadingAutoContext(false));
  }, [repoTree, repo, userId, openFiles.length]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isChatting]);

  const buildFileContext = useCallback(() => {
    // Use open files if available, otherwise use auto-fetched context
    const contextFiles = openFiles.length > 0 
      ? openFiles.filter(f => fileContents[f]).map(f => ({ path: f, content: fileContents[f] as string }))
      : Object.entries(autoContextFiles).map(([path, content]) => ({ path, content: content as string }));

    const ctx = contextFiles
      .map(f => `--- ${f.path} ---\n${f.content}`)
      .join('\n\n');
    return ctx || undefined;
  }, [openFiles, fileContents, autoContextFiles]);

  const buildFileSnapshot = useCallback((): Record<string, string> | undefined => {
    const snapshot: Record<string, string> = {};
    if (openFiles.length > 0) {
      openFiles.forEach(f => {
        if (fileContents[f]) snapshot[f] = fileContents[f];
      });
    } else {
      Object.entries(autoContextFiles).forEach(([path, content]) => {
        snapshot[path] = content;
      });
    }
    return Object.keys(snapshot).length > 0 ? snapshot : undefined;
  }, [openFiles, fileContents, autoContextFiles]);

  // --- AI Chat with patch support ---
  const handleSendChat = async () => {
    if (!input.trim() || isChatting || !session) return;
    const userContent = input;
    setInput('');
    setIsChatting(true);

    try {
      const fileSnapshot = buildFileSnapshot();
      const { message: savedUserMsg } = await api.saveChatMessage(session.id, 'user', userContent, fileSnapshot);
      setMessages(prev => [...prev, savedUserMsg]);

      const allMsgs = [...messages, savedUserMsg];
      const chatMessages = allMsgs.map(m => ({ role: m.role, content: m.content }));
      const fileCtx = buildFileContext();

      const response = await api.aiChat(chatMessages, fileCtx, userId);

      // Save assistant message with file snapshot
      const { message: savedAssistantMsg } = await api.saveChatMessage(session.id, 'assistant', response.reply, fileSnapshot);
      setMessages(prev => [...prev, savedAssistantMsg]);

      // If patches are present, store them for user to apply
      if (response.patches && response.patches.length > 0) {
        setPendingPatches({
          msgIdx: messages.length + 2,
          patches: response.patches,
          commitMessage: response.commitMessage || '[Danspace] AI changes',
        });
      }
    } catch (e: any) {
      const errContent = `Errore: ${e.message}`;
      if (session) {
        const { message: errMsg } = await api.saveChatMessage(session.id, 'assistant', errContent);
        setMessages(prev => [...prev, errMsg]);
      }
    } finally {
      setIsChatting(false);
    }
  };

  // --- Apply patches (multi-file with report + chat message) ---
  const handleApplyPatches = async () => {
    if (!pendingPatches || !repo || !userId) return;
    setApplyingPatches(true);
    
    try {
      const updates: Record<string, string> = {};
      const failures: string[] = [];
      
      // Client-side: filter out protected files
      const blockedFiles = pendingPatches.patches.filter(p => isClientProtectedFile(p.file));
      const safePatches = pendingPatches.patches.filter(p => !isClientProtectedFile(p.file));
      
      if (blockedFiles.length > 0) {
        toast({
          title: 'File protetti bloccati',
          description: `${blockedFiles.map(f => f.file).join(', ')} non possono essere modificati.`,
          variant: 'destructive',
        });
      }
      
      if (safePatches.length === 0) {
        toast({ title: 'Nessuna modifica applicabile', variant: 'destructive' });
        setApplyingPatches(false);
        setPendingPatches(null);
        return;
      }
      
      for (const patch of safePatches) {
        try {
          // Get current SHA for the file (or handle new files)
          let sha = '';
          try {
            const fileData = await api.fetchFile(userId, repo.owner, repo.name, patch.file);
            sha = fileData.sha;
          } catch {
            // File doesn't exist yet — new file commit (sha empty)
          }
          await api.commitFile({
            userId,
            owner: repo.owner,
            name: repo.name,
            path: patch.file,
            content: patch.content,
            message: pendingPatches.commitMessage,
            sha,
            sessionId: session?.id,
          });
          updates[patch.file] = patch.content;
        } catch (e: any) {
          failures.push(patch.file);
          toast({ title: `Errore su ${patch.file}`, description: e.message, variant: 'destructive' });
        }
      }

      // Update local file contents
      if (onFileContentsUpdate && Object.keys(updates).length > 0) {
        onFileContentsUpdate(updates);
      }

      const successCount = Object.keys(updates).length;
      const resultMsg = failures.length > 0
        ? `✅ Modifica applicata: ${successCount} file aggiornati su GitHub. ⚠️ ${failures.length} file falliti: ${failures.join(', ')}`
        : `✅ Modifica applicata: ${successCount} file aggiornati su GitHub.`;

      // Save confirmation message in chat
      if (session) {
        const { message: confirmMsg } = await api.saveChatMessage(session.id, 'assistant', resultMsg);
        setMessages(prev => [...prev, confirmMsg]);
      }

      toast({
        title: 'Modifiche applicate',
        description: `${successCount} file aggiornati e committati su GitHub.`,
      });
      setPendingPatches(null);
    } catch (e: any) {
      toast({ title: 'Errore', description: e.message, variant: 'destructive' });
    } finally {
      setApplyingPatches(false);
    }
  };

  // --- Revert with file restoration ---
  const handleRevertClick = (msg: DbMessage) => {
    if (msg.file_context && Object.keys(msg.file_context).length > 0) {
      setRevertDialog({ messageId: msg.id, fileContext: msg.file_context });
    } else {
      handleRevertMessages(msg.id);
    }
  };

  const handleRevertMessages = async (messageId: string) => {
    if (!session) return;
    try {
      const { messages: reverted } = await api.revertToMessage(session.id, messageId);
      setMessages(reverted);
      setPendingPatches(null);
      toast({ title: 'Messaggi ripristinati' });
    } catch (e: any) {
      toast({ title: 'Errore revert', description: e.message, variant: 'destructive' });
    }
  };

  const handleRevertWithFiles = async () => {
    if (!revertDialog || !repo || !userId || !session) return;
    setReverting(true);

    try {
      const updates: Record<string, string> = {};

      for (const [filePath, content] of Object.entries(revertDialog.fileContext) as [string, string][]) {
        try {
          const fileData = await api.fetchFile(userId, repo.owner, repo.name, filePath);
          await api.commitFile({
            userId,
            owner: repo.owner,
            name: repo.name,
            path: filePath,
            content: content as string,
            message: `[Danspace] Revert file to previous state`,
            sha: fileData.sha,
            sessionId: session.id,
          });
          updates[filePath] = content as string;
        } catch (e: any) {
          console.error(`Failed to revert ${filePath}:`, e);
        }
      }

      if (onFileContentsUpdate && Object.keys(updates).length > 0) {
        onFileContentsUpdate(updates);
      }

      const { messages: reverted } = await api.revertToMessage(session.id, revertDialog.messageId);
      setMessages(reverted);
      setPendingPatches(null);

      toast({
        title: 'Ripristino completato',
        description: `${Object.keys(updates).length} file ripristinati e messaggi rimossi.`,
      });
    } catch (e: any) {
      toast({ title: 'Errore ripristino', description: e.message, variant: 'destructive' });
    } finally {
      setReverting(false);
      setRevertDialog(null);
    }
  };

  // --- AI Action Pipeline ---
  const handleExecuteAction = async () => {
    if (!actionInput.trim() || isProcessing || !session || !repo) return;
    setIsProcessing(true);
    setExecutionResult(null);

    try {
      setPipelineState('PLANNING');
      const intent = await api.normalizeIntent(actionInput);

      // Use open files or auto-context files
      let filesToSend: { path: string; content: string }[];
      if (openFiles.length > 0) {
        filesToSend = openFiles
          .filter(f => fileContents[f])
          .map(f => ({ path: f, content: fileContents[f] }));
      } else {
        filesToSend = Object.entries(autoContextFiles).map(([path, content]) => ({ path, content: content as string }));
      }

      if (filesToSend.length === 0) {
        throw new Error('Nessun file disponibile come contesto. Apri almeno un file o attendi il caricamento automatico.');
      }

      setPipelineState('EXECUTING');
      const result = await api.executeAi({
        sessionId: session.id,
        intentType: intent.intentType,
        files: filesToSend,
        userPrompt: actionInput,
      });

      setPipelineState('VALIDATING');
      const validation = await api.validateDiff(result.patches, filesToSend.map(f => f.path), repo.base_path || undefined);

      if (!validation.valid) {
        throw new Error(`Validazione fallita: ${validation.errors.join(', ')}`);
      }

      setExecutionResult(result);
      setPipelineState('DONE');
      setActionInput('');
      
      try { await api.transitionState(session.id, 'IDLE'); } catch {}
      
      toast({ title: 'Azione completata', description: result.commitMessage });
    } catch (e: any) {
      if (session) {
        const { message: errMsg } = await api.saveChatMessage(session.id, 'assistant', `Azione fallita: ${e.message}`);
        setMessages(prev => [...prev, errMsg]);
      }
      setPipelineState('FAILED');
      toast({ title: 'Azione fallita', description: e.message, variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const contextFileCount = openFiles.length > 0 ? openFiles.length : Object.keys(autoContextFiles).length;
  const contextLabel = openFiles.length > 0 
    ? `${openFiles.length} file aperti come contesto` 
    : `${Object.keys(autoContextFiles).length} file auto-caricati come contesto`;

  return (
    <div className="flex h-full flex-col bg-card">
      {/* Revert confirmation dialog */}
      <Dialog open={!!revertDialog} onOpenChange={() => setRevertDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-sm">Ripristina file e messaggi</DialogTitle>
            <DialogDescription className="text-xs">
              I file torneranno allo stato salvato in questo punto della conversazione.
              {revertDialog && (
                <span className="block mt-1 text-muted-foreground">
                  {Object.keys(revertDialog.fileContext).length} file verranno ripristinati: {Object.keys(revertDialog.fileContext).join(', ')}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRevertDialog(null)} className="text-xs h-8">
              Annulla
            </Button>
            <Button size="sm" onClick={handleRevertWithFiles} disabled={reverting} className="text-xs h-8" variant="destructive">
              {reverting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RotateCcw className="h-3 w-3 mr-1" />}
              Ripristina
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="chat" className="flex h-full flex-col">
        <div className="border-b border-border px-3">
          <TabsList className="h-10 bg-transparent p-0 gap-1">
            <TabsTrigger value="chat" className="h-8 rounded-md px-3 text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
              Chat
            </TabsTrigger>
            <TabsTrigger value="action" className="h-8 rounded-md px-3 text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <Zap className="mr-1.5 h-3.5 w-3.5" />
              Action
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Chat Tab */}
        <TabsContent value="chat" className="flex-1 flex flex-col mt-0 overflow-hidden">
          <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-3">
            {loadingHistory ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="ml-2 text-xs text-muted-foreground">Caricamento cronologia...</span>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div key={msg.id} className={`group animate-fade-in ${msg.role === 'user' ? 'ml-6' : 'mr-6'}`}>
                  <div className={`rounded-lg p-3 text-xs leading-relaxed ${
                    msg.role === 'user' ? 'bg-primary/10 text-foreground' : 'bg-secondary/50 text-foreground'
                  }`}>
                    {msg.role === 'assistant' && <Bot className="inline h-3 w-3 mr-1 text-primary" />}
                    <div className="prose prose-sm prose-invert max-w-none text-xs">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                    {msg.file_context && Object.keys(msg.file_context).length > 0 && (
                      <div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                        <FileCode className="h-2.5 w-2.5" />
                        <span>{Object.keys(msg.file_context).length} file nel contesto</span>
                      </div>
                    )}
                  </div>
                  {/* Revert button */}
                  {msg.role === 'assistant' && idx > 0 && (
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity mt-1 flex justify-end">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-destructive"
                            onClick={() => handleRevertClick(msg)}
                          >
                            <RotateCcw className="h-2.5 w-2.5 mr-0.5" />
                            Ripristina qui
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="text-xs">
                          {msg.file_context ? 'Ripristina file e messaggi a questo punto' : 'Elimina messaggi successivi'}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  )}
                </div>
              ))
            )}

            {/* Pending patches banner with preview */}
            {pendingPatches && (
              <div className="animate-slide-in-right rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                <div className="flex items-center gap-1.5">
                  <GitCommit className="h-3.5 w-3.5 text-primary" />
                  <p className="text-xs font-medium text-primary">Anteprima modifiche ({pendingPatches.patches.length} file)</p>
                </div>
                
                {/* File list with blocked indicator */}
                <div className="space-y-1.5">
                  {pendingPatches.patches.map(p => {
                    const blocked = isClientProtectedFile(p.file);
                    return (
                      <div key={p.file} className={`rounded px-2 py-1 ${blocked ? 'bg-destructive/10 border border-destructive/20' : 'bg-secondary/50'}`}>
                        <div className="flex items-center gap-1.5">
                          <FileCode className="h-3 w-3 shrink-0 text-muted-foreground" />
                          <p className={`text-[10px] font-mono truncate ${blocked ? 'text-destructive line-through' : 'text-foreground/80'}`}>{p.file}</p>
                          {blocked && <span className="text-[9px] text-destructive font-medium shrink-0">PROTETTO</span>}
                        </div>
                        {!blocked && (
                          <p className="text-[9px] text-muted-foreground mt-0.5">
                            {p.content.split('\n').length} righe · {(new TextEncoder().encode(p.content).length / 1024).toFixed(1)} KB
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
                
                <p className="text-[10px] text-muted-foreground font-mono">{pendingPatches.commitMessage}</p>
                
                <div className="flex gap-2">
                  <Button size="sm" className="h-7 text-xs flex-1" onClick={handleApplyPatches} disabled={applyingPatches}>
                    {applyingPatches ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle className="h-3 w-3 mr-1" />}
                    Applica
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPendingPatches(null)} disabled={applyingPatches}>
                    Annulla
                  </Button>
                </div>
              </div>
            )}

            {isChatting && (
              <div className="mr-6 animate-fade-in">
                <div className="rounded-lg bg-secondary/50 p-3 text-xs">
                  <Loader2 className="h-3 w-3 animate-spin text-primary inline mr-1" />
                  <span className="text-muted-foreground">Sto pensando...</span>
                </div>
              </div>
            )}
          </div>

          {/* Context indicator */}
          {(contextFileCount > 0 || loadingAutoContext) && (
            <div className="border-t border-border px-3 py-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
              {loadingAutoContext ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Caricamento contesto automatico...</span>
                </>
              ) : (
                <>
                  <FileCode className="h-3 w-3" />
                  <span>{contextLabel}</span>
                </>
              )}
            </div>
          )}

          <div className="border-t border-border p-3">
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendChat()}
                placeholder="Chiedi del codice..."
                className="h-9 text-xs bg-secondary/50"
                disabled={isChatting || !session}
              />
              <Button size="sm" onClick={handleSendChat} className="h-9 px-3" disabled={isChatting || !session}>
                {isChatting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Action Tab */}
        <TabsContent value="action" className="flex-1 flex flex-col mt-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-4">
            <div className="glass-panel rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground">Pipeline Locale</span>
                <StateIndicator state={pipelineState} />
              </div>
              <div className="flex gap-1.5">
                {(['IDLE', 'PLANNING', 'EXECUTING', 'VALIDATING', 'DONE'] as SessionState[]).map(s => (
                  <div key={s} className={`h-1.5 flex-1 rounded-full transition-default ${
                    s === pipelineState ? 'bg-primary' :
                    getStateOrder(s) < getStateOrder(pipelineState) ? 'bg-primary/40' : 'bg-border'
                  }`} />
                ))}
              </div>
            </div>

            <div className="rounded-lg bg-secondary/30 p-3 text-xs text-muted-foreground space-y-2">
              <p className="font-medium text-foreground">Pipeline AI Action</p>
              <ol className="list-decimal list-inside space-y-1">
                <li className={pipelineState === 'PLANNING' ? 'text-primary font-medium' : ''}>Normalizza intent</li>
                <li className={pipelineState === 'EXECUTING' ? 'text-primary font-medium' : ''}>Genera patch (Gemini Flash)</li>
                <li className={pipelineState === 'VALIDATING' ? 'text-primary font-medium' : ''}>Valida diff & sicurezza</li>
                <li className={pipelineState === 'DONE' ? 'text-primary font-medium' : ''}>Review & commit</li>
              </ol>
            </div>

            {contextFileCount > 0 && (
              <div className="rounded-lg bg-secondary/30 p-3 text-xs">
                <p className="text-muted-foreground mb-1.5">Contesto ({contextFileCount} file{openFiles.length === 0 ? ' - auto' : ''}):</p>
                {(openFiles.length > 0 ? openFiles : Object.keys(autoContextFiles)).map(f => (
                  <p key={f} className="font-mono text-foreground/70 truncate">{f}</p>
                ))}
              </div>
            )}

            {executionResult && (
              <div className="animate-slide-in-right rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
                <div className="flex items-center gap-1.5">
                  <CheckCircle className="h-3.5 w-3.5 text-primary" />
                  <p className="text-xs font-medium text-primary">Esecuzione Completata</p>
                </div>
                <p className="text-xs text-muted-foreground font-mono">{executionResult.commitMessage}</p>
                <pre className="text-[10px] text-foreground/60 font-mono whitespace-pre-wrap max-h-40 overflow-y-auto bg-background/50 rounded p-2">
                  {executionResult.patches}
                </pre>
              </div>
            )}

            {pipelineState === 'FAILED' && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                  <p className="text-xs font-medium text-destructive">Esecuzione Fallita</p>
                </div>
                <Button variant="outline" size="sm" className="mt-2 h-7 text-xs" onClick={() => setPipelineState('IDLE')}>
                  Reset
                </Button>
              </div>
            )}
          </div>

          <div className="border-t border-border p-3">
            <div className="flex gap-2">
              <Input
                value={actionInput}
                onChange={e => setActionInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleExecuteAction()}
                placeholder="Descrivi la modifica..."
                className="h-9 text-xs bg-secondary/50"
                disabled={isProcessing}
              />
              <Button
                size="sm"
                onClick={handleExecuteAction}
                disabled={isProcessing || !actionInput.trim()}
                className="h-9 px-3"
              >
                {isProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

const StateIndicator = ({ state }: { state: SessionState }) => {
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
    <div className="flex items-center gap-1.5">
      <div className={`h-2 w-2 rounded-full ${colors[state]}`} />
      <span className="text-xs font-mono text-muted-foreground">{state}</span>
    </div>
  );
};

function getStateOrder(state: SessionState): number {
  const order: Record<SessionState, number> = {
    IDLE: 0, PLANNING: 1, SPEC_LOCKED: 2, EXECUTING: 3, VALIDATING: 4, DONE: 5, FAILED: 6,
  };
  return order[state];
}

export default AiPanel;
