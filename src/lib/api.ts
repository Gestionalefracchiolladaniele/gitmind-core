import type { Session, SessionState, Repository, User, GitHubRepo, FileNode, IntentResult, DiffValidation, CommitResult, AutonomousSpec } from './types';

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const EDGE_URL = `https://${PROJECT_ID}.supabase.co/functions/v1`;

async function callEdge<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${EDGE_URL}/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export const api = {
  // ===== AUTH =====
  getAuthUrl: (redirectUri: string) =>
    callEdge<{ url: string; state: string }>('github-auth', { action: 'get_auth_url', redirectUri }),

  authCallback: (code: string, redirectUri?: string) =>
    callEdge<{ user: User }>('github-auth', { action: 'callback', code, redirectUri }),

  verifyUser: (userId: string) =>
    callEdge<{ user: User }>('github-auth', { action: 'verify', userId }),

  // ===== SESSION =====
  createSession: (repoId: string, mode: 'chat' | 'action' | 'autonomous') =>
    callEdge<{ session: Session }>('gitmind-api', { action: 'session.create', repoId, mode }),

  getSession: (sessionId: string) =>
    callEdge<{ session: Session }>('gitmind-api', { action: 'session.get', sessionId }),

  transitionState: (sessionId: string, newState: SessionState) =>
    callEdge<{ session: Session }>('gitmind-api', { action: 'session.transition', sessionId, newState }),

  // ===== REPOSITORY =====
  attachRepo: (userId: string, owner: string, name: string) =>
    callEdge<{ repository: Repository }>('gitmind-api', { action: 'repo.attach', userId, owner, name }),

  listRepos: (userId: string) =>
    callEdge<{ repositories: Repository[] }>('gitmind-api', { action: 'repo.list', userId }),

  deleteRepo: (repoId: string, userId: string) =>
    callEdge<{ success: boolean }>('gitmind-api', { action: 'repo.delete', repoId, userId }),

  // ===== GITHUB =====
  fetchTree: (userId: string, owner: string, name: string, branch?: string, basePath?: string) =>
    callEdge<{ files: { path: string; size: number; sha: string }[]; truncated: boolean }>('gitmind-api', {
      action: 'github.fetchTree', userId, owner, name, branch, basePath,
    }),

  fetchFile: (userId: string, owner: string, name: string, path: string) =>
    callEdge<{ path: string; content: string; sha: string; size: number }>('gitmind-api', {
      action: 'github.fetchFile', userId, owner, name, path,
    }),

  commitFile: (params: { userId: string; owner: string; name: string; path: string; content: string; message: string; sha: string; branch?: string; sessionId?: string }) =>
    callEdge<CommitResult>('gitmind-api', { action: 'github.commitFile', ...params }),

  listGitHubRepos: (userId: string) =>
    callEdge<{ repos: GitHubRepo[] }>('gitmind-api', { action: 'github.listUserRepos', userId }),

  // ===== AI =====
  aiChat: (messages: { role: string; content: string }[], fileContext?: string, userId?: string) =>
    callEdge<{ reply: string; patches?: { file: string; content: string }[]; commitMessage?: string }>('ai-chat', { messages, fileContext, userId }),

  normalizeIntent: (input: string) =>
    callEdge<IntentResult>('ai-execute', { action: 'normalize', input }),

  compileTask: (sessionId: string, intentType: string, files: string[], basePath?: string) =>
    callEdge<{ task: Record<string, unknown> }>('ai-execute', { action: 'compile', sessionId, intentType, files, basePath }),

  executeAi: (params: { sessionId: string; intentType: string; files: { path: string; content: string }[]; userPrompt: string }) =>
    callEdge<{ patches: string; commitMessage: string; retries: number }>('ai-execute', { action: 'execute', ...params }),

  validateDiff: (patch: string, allowedFiles?: string[], basePath?: string) =>
    callEdge<DiffValidation>('ai-execute', { action: 'validate', patch, allowedFiles, basePath }),

  // ===== CHAT MESSAGES =====
  saveChatMessage: (sessionId: string, role: string, content: string, fileContext?: Record<string, string>) =>
    callEdge<{ message: { id: string; session_id: string; role: string; content: string; file_context: Record<string, string> | null; created_at: string } }>('gitmind-api', { action: 'chat.saveMessage', sessionId, role, content, fileContext }),

  getChatMessages: (sessionId: string) =>
    callEdge<{ messages: { id: string; session_id: string; role: string; content: string; file_context: Record<string, string> | null; created_at: string }[] }>('gitmind-api', { action: 'chat.getMessages', sessionId }),

  revertToMessage: (sessionId: string, messageId: string) =>
    callEdge<{ messages: { id: string; session_id: string; role: string; content: string; file_context: Record<string, string> | null; created_at: string }[] }>('gitmind-api', { action: 'chat.revertToMessage', sessionId, messageId }),

  // ===== USER SETTINGS =====
  getUserSettings: (userId: string) =>
    callEdge<{ ai_provider: string; custom_api_key: string | null; api_token: string | null }>('gitmind-api', { action: 'settings.get', userId }),

  saveUserSettings: (userId: string, settings: { ai_provider: string; custom_api_key: string | null }) =>
    callEdge<{ success: boolean }>('gitmind-api', { action: 'settings.save', userId, ...settings }),

  regenerateApiToken: (userId: string) =>
    callEdge<{ api_token: string }>('gitmind-api', { action: 'settings.regenerateToken', userId }),

  // ===== AUTONOMOUS =====
  saveSpec: (sessionId: string, specJson: Record<string, unknown>) =>
    callEdge<{ spec: AutonomousSpec }>('gitmind-api', { action: 'autonomous.saveSpec', sessionId, specJson }),

  lockSpec: (specId: string) =>
    callEdge<{ spec: AutonomousSpec }>('gitmind-api', { action: 'autonomous.lockSpec', specId }),

  getSpec: (sessionId: string) =>
    callEdge<{ spec: AutonomousSpec }>('gitmind-api', { action: 'autonomous.getSpec', sessionId }),
};
