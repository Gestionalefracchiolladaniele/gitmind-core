import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GitBranch, Zap, Shield, ArrowRight, Github } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';

const AuthPage = () => {
  const navigate = useNavigate();
  const { user, login, isLoading: authLoading } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (user) navigate('/dashboard');
  }, [user, navigate]);

  const handleLogin = async () => {
    setIsLoading(true);
    try {
      await login();
      // If simulated login (no GitHub OAuth), navigate immediately
      // Real OAuth will redirect to GitHub
      setTimeout(() => navigate('/dashboard'), 500);
    } catch {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/3 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/3 h-64 w-64 rounded-full bg-primary/3 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md px-6 animate-fade-in">
        <div className="mb-12 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 glow-accent">
            <GitBranch className="h-8 w-8 text-primary" />
          </div>
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-foreground font-mono">
            GitMind AI
          </h1>
          <p className="text-muted-foreground">
            AI-native code editing platform
          </p>
        </div>

        <div className="glass-panel rounded-xl p-6 space-y-6">
          <div className="space-y-4">
            <Feature icon={Zap} text="AI-powered code orchestration" />
            <Feature icon={Shield} text="Deterministic intent classification" />
            <Feature icon={GitBranch} text="Real GitHub commit engine" />
          </div>

          <Button
            onClick={handleLogin}
            disabled={isLoading || authLoading}
            className="w-full h-12 text-base font-medium transition-default glow-accent hover:glow-accent-strong"
          >
            {isLoading ? (
              <span className="animate-pulse-glow">Connecting...</span>
            ) : (
              <>
                <Github className="mr-2 h-5 w-5" />
                Sign in with GitHub
              </>
            )}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Connects to your GitHub repositories · Scopes: repo, read:user
          </p>
        </div>
      </div>
    </div>
  );
};

const Feature = ({ icon: Icon, text }: { icon: React.ElementType; text: string }) => (
  <div className="flex items-center gap-3 text-sm">
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
      <Icon className="h-4 w-4 text-primary" />
    </div>
    <span className="text-muted-foreground">{text}</span>
  </div>
);

export default AuthPage;
