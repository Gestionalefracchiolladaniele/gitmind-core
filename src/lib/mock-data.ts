import type { FileNode, Repository, ChatMessage } from './types';

export const MOCK_REPOSITORIES: Omit<Repository, 'id' | 'user_id' | 'created_at'>[] = [
  { owner: 'danspace', name: 'core-engine', default_branch: 'main', base_path: '/src', github_repo_id: null },
  { owner: 'danspace', name: 'web-client', default_branch: 'main', base_path: '/app', github_repo_id: null },
  { owner: 'danspace', name: 'ai-orchestrator', default_branch: 'develop', base_path: '/lib', github_repo_id: null },
];

export const MOCK_FILE_TREE: FileNode[] = [
  {
    name: 'src', path: '/src', type: 'folder',
    children: [
      {
        name: 'components', path: '/src/components', type: 'folder',
        children: [
          { name: 'App.tsx', path: '/src/components/App.tsx', type: 'file', language: 'tsx' },
          { name: 'Header.tsx', path: '/src/components/Header.tsx', type: 'file', language: 'tsx' },
          { name: 'Sidebar.tsx', path: '/src/components/Sidebar.tsx', type: 'file', language: 'tsx' },
        ],
      },
      {
        name: 'lib', path: '/src/lib', type: 'folder',
        children: [
          { name: 'utils.ts', path: '/src/lib/utils.ts', type: 'file', language: 'ts' },
          { name: 'api.ts', path: '/src/lib/api.ts', type: 'file', language: 'ts' },
        ],
      },
      { name: 'index.ts', path: '/src/index.ts', type: 'file', language: 'ts' },
      { name: 'config.json', path: '/src/config.json', type: 'file', language: 'json' },
    ],
  },
  {
    name: 'tests', path: '/tests', type: 'folder',
    children: [
      { name: 'app.test.ts', path: '/tests/app.test.ts', type: 'file', language: 'ts' },
    ],
  },
  { name: 'package.json', path: '/package.json', type: 'file', language: 'json' },
  { name: 'README.md', path: '/README.md', type: 'file', language: 'md' },
];

export const MOCK_FILE_CONTENTS: Record<string, string> = {
  '/src/components/App.tsx': `import React from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

interface AppProps {
  title: string;
  version: string;
}

export const App: React.FC<AppProps> = ({ title, version }) => {
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    console.log(\`\${title} v\${version} initialized\`);
  }, [title, version]);

  return (
    <div className="app-container">
      <Header title={title} />
      <div className="main-content">
        <Sidebar />
        <main>
          {isLoading ? <p>Loading...</p> : <p>Content</p>}
        </main>
      </div>
    </div>
  );
};`,
  '/src/lib/utils.ts': `export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}`,
};

export const MOCK_CHAT_MESSAGES: ChatMessage[] = [
  {
    id: '1',
    role: 'assistant',
    content: 'Welcome to Danspace AI. I can help you analyze and modify code in this repository. What would you like to do?',
    timestamp: new Date(),
  },
];
