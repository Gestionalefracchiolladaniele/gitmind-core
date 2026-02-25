import * as React from 'react';
import { X, FileCode2 } from 'lucide-react';

interface CodeViewerProps {
  openFiles: string[];
  activeFile: string | null;
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  fileContents: Record<string, string>;
}

const CodeViewer = ({ openFiles, activeFile, onSelectTab, onCloseTab, fileContents }: CodeViewerProps) => {
  const content = activeFile ? fileContents[activeFile] : null;

  return (
    <div className="flex h-full flex-col bg-background">
      {openFiles.length > 0 && (
        <div className="flex border-b border-border bg-card/50 overflow-x-auto scrollbar-thin">
          {openFiles.map(path => {
            const name = path.split('/').pop() || '';
            const isActive = path === activeFile;
            return (
              <div
                key={path}
                className={`group flex items-center gap-2 border-r border-border px-3 py-2 text-xs font-mono cursor-pointer transition-default shrink-0 ${
                  isActive
                    ? 'bg-background text-foreground border-b-2 border-b-primary'
                    : 'text-muted-foreground hover:bg-secondary/30'
                }`}
                onClick={() => onSelectTab(path)}
              >
                <FileCode2 className="h-3.5 w-3.5" />
                <span>{name}</span>
                <button
                  onClick={e => { e.stopPropagation(); onCloseTab(path); }}
                  className="ml-1 rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-secondary transition-default"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex-1 overflow-auto scrollbar-thin">
        {content ? (
          <div className="p-4">
            <pre className="text-xs leading-relaxed">
              <code className="font-mono">
                {content.split('\n').map((line, i) => (
                  <div key={i} className="flex hover:bg-secondary/20 transition-default rounded">
                    <span className="inline-block w-10 shrink-0 pr-4 text-right text-muted-foreground/50 select-none">
                      {i + 1}
                    </span>
                    <span className="text-foreground whitespace-pre">{highlightLine(line)}</span>
                  </div>
                ))}
              </code>
            </pre>
          </div>
        ) : activeFile ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <p className="text-sm animate-pulse">Loading file...</p>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <div className="text-center">
              <FileCode2 className="mx-auto mb-3 h-12 w-12 opacity-20" />
              <p className="text-sm">Select a file to view</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

function highlightLine(line: string): React.ReactNode {
  const highlighted = line
    .replace(/(import|export|from|const|let|var|function|return|if|else|interface|type|async|await|new|class|extends|default)\b/g, '⟨KW⟩$1⟨/KW⟩')
    .replace(/(string|number|boolean|void|null|undefined|true|false)\b/g, '⟨TY⟩$1⟨/TY⟩')
    .replace(/(\/\/.*)/g, '⟨CM⟩$1⟨/CM⟩')
    .replace(/('[^']*'|"[^"]*"|`[^`]*`)/g, '⟨ST⟩$1⟨/ST⟩');

  const parts = highlighted.split(/(⟨\/?(?:KW|TY|CM|ST)⟩)/);
  const result: React.ReactNode[] = [];
  let currentClass = '';

  const classMap: Record<string, string> = {
    KW: 'text-lime-400',
    TY: 'text-cyan-400',
    CM: 'text-muted-foreground/60 italic',
    ST: 'text-emerald-400',
  };

  parts.forEach((part, i) => {
    if (part.startsWith('⟨') && !part.startsWith('⟨/')) {
      const tag = part.slice(1, -1);
      currentClass = classMap[tag] || '';
    } else if (part.startsWith('⟨/')) {
      currentClass = '';
    } else if (part) {
      result.push(
        currentClass ? <span key={i} className={currentClass}>{part}</span> : part
      );
    }
  });

  return <>{result}</>;
}

export default CodeViewer;
