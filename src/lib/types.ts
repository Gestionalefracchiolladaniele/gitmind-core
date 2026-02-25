// Core domain types for Danspace AI

export type SessionState = 'IDLE' | 'PLANNING' | 'SPEC_LOCKED' | 'EXECUTING' | 'VALIDATING' | 'DONE' | 'FAILED';
export type SessionMode = 'chat' | 'action' | 'autonomous';
export type AiTaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface User {
  id: string;
  name: string;
  avatar_url: string | null;
  github_id: string | null;
  created_at: string;
}

export interface Repository {
  id: string;
  user_id: string;
  owner: string;
  name: string;
  default_branch: string;
  base_path: string | null;
  github_repo_id: string | null;
  created_at: string;
}

export interface Session {
  id: string;
  repo_id: string;
  mode: SessionMode;
  state: SessionState;
  created_at: string;
  updated_at: string;
}

export interface AiTask {
  id: string;
  session_id: string;
  intent_type: string;
  compiled_prompt_hash: string | null;
  status: AiTaskStatus;
  retry_count: number;
  result: Record<string, unknown> | null;
  created_at: string;
}

export interface AutonomousSpec {
  id: string;
  session_id: string;
  spec_json: {
    purpose: string;
    features: string[];
    routes: string[];
    data_models: Record<string, unknown>[];
    ui_pages: string[];
    constraints: string[];
  };
  locked_at: string | null;
  created_at: string;
}

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileNode[];
  language?: string;
  sha?: string;
  size?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface GitHubRepo {
  id: number;
  owner: string;
  name: string;
  full_name: string;
  default_branch: string;
  private: boolean;
  updated_at: string;
}

export interface DiffValidation {
  valid: boolean;
  errors: string[];
}

export interface CommitResult {
  commitHash: string;
  message: string;
  path: string;
}

export interface IntentResult {
  intentType: string;
  confidence: number;
  riskLevel: string;
}

// State machine valid transitions
export const VALID_TRANSITIONS: Record<SessionState, SessionState[]> = {
  IDLE: ['PLANNING'],
  PLANNING: ['SPEC_LOCKED', 'EXECUTING', 'FAILED'],
  SPEC_LOCKED: ['EXECUTING', 'FAILED'],
  EXECUTING: ['VALIDATING', 'DONE', 'FAILED'],
  VALIDATING: ['EXECUTING', 'DONE', 'FAILED'],
  DONE: ['IDLE'],
  FAILED: ['IDLE'],
};
