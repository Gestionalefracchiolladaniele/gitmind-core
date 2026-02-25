import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { resolveGitHubRedirectUri, useAuth } from '@/lib/auth';

const AuthCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { handleCallback } = useAuth();

  useEffect(() => {
    const code = searchParams.get('code');
    if (code) {
      handleCallback(code, resolveGitHubRedirectUri())
        .then(() => navigate('/dashboard'))
        .catch((err) => {
          console.error('Auth callback failed:', err);
          navigate('/?error=auth_failed');
        });
    } else {
      navigate('/?error=no_code');
    }
  }, [searchParams, handleCallback, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-sm text-muted-foreground">Authenticating with GitHub...</p>
      </div>
    </div>
  );
};

export default AuthCallback;
