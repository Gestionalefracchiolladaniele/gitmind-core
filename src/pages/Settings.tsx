import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Key, Globe, Copy, RefreshCw, Check, Loader2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';

const MODELS = [
  { value: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash Preview', description: 'Veloce, bilanciato' },
  { value: 'google/gemini-3-pro-preview', label: 'Gemini 3 Pro Preview', description: 'Ragionamento avanzato' },
  { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', description: 'Top-tier, contesto ampio' },
  { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', description: 'Buon bilanciamento costo/qualità' },
  { value: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', description: 'Più veloce e economico' },
  { value: 'google/gemini-3-pro-image-preview', label: 'Gemini 3 Pro Image', description: 'Generazione immagini' },
  { value: 'openai/gpt-5', label: 'GPT-5', description: 'Potente, ragionamento complesso' },
  { value: 'openai/gpt-5-mini', label: 'GPT-5 Mini', description: 'Bilanciato, costo ridotto' },
  { value: 'openai/gpt-5-nano', label: 'GPT-5 Nano', description: 'Veloce, task semplici' },
  { value: 'openai/gpt-5.2', label: 'GPT-5.2', description: 'Ultimo modello OpenAI' },
];

const Settings = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedModel, setSelectedModel] = useState('google/gemini-3-flash-preview');
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    if (!user) { navigate('/'); return; }
    loadSettings();
  }, [user]);

  const loadSettings = async () => {
    if (!user) return;
    try {
      const data = await api.getUserSettings(user.id);
      if (data) {
        setProvider(data.ai_provider || 'lovable');
        setCustomApiKey(data.custom_api_key || '');
        setApiToken(data.api_token || '');
      }
    } catch {
      // No settings yet, use defaults
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await api.saveUserSettings(user.id, {
        ai_provider: provider,
        custom_api_key: provider !== 'lovable' ? customApiKey : null,
      });
      toast({ title: 'Impostazioni salvate', description: 'Le tue preferenze AI sono state aggiornate.' });
    } catch (e: any) {
      toast({ title: 'Errore', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerateToken = async () => {
    if (!user) return;
    setRegenerating(true);
    try {
      const data = await api.regenerateApiToken(user.id);
      setApiToken(data.api_token);
      toast({ title: 'Token rigenerato', description: 'Il vecchio token non funzionerà più.' });
    } catch (e: any) {
      toast({ title: 'Errore', description: e.message, variant: 'destructive' });
    } finally {
      setRegenerating(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const proxyEndpoint = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-proxy`;

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-11 items-center border-b border-border bg-card/50 px-4 gap-3">
        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => navigate('/dashboard')}>
          <ArrowLeft className="h-3.5 w-3.5" />
        </Button>
        <span className="text-sm font-medium text-foreground">Impostazioni</span>
      </header>

      <div className="mx-auto max-w-2xl p-6 space-y-8">
        {/* AI Provider Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Provider AI</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Scegli quale servizio AI utilizzare per la chat e le azioni nel workspace.
          </p>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Provider</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map(p => (
                    <SelectItem key={p.value} value={p.value} className="text-xs">
                      <div>
                        <span className="font-medium">{p.label}</span>
                        <span className="ml-2 text-muted-foreground">{p.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {provider !== 'lovable' && (
              <div className="space-y-1.5 animate-fade-in">
                <Label className="text-xs">API Key ({provider})</Label>
                <Input
                  type="password"
                  value={customApiKey}
                  onChange={e => setCustomApiKey(e.target.value)}
                  placeholder={`Inserisci la tua ${provider} API key...`}
                  className="h-9 text-xs font-mono"
                />
                <p className="text-[10px] text-muted-foreground">
                  La chiave viene salvata in modo sicuro nel database.
                </p>
              </div>
            )}

            <Button onClick={handleSave} disabled={saving} size="sm" className="h-8 text-xs">
              {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}
              Salva Impostazioni
            </Button>
          </div>
        </section>

        {/* API Proxy Section */}
        <section className="space-y-4 border-t border-border pt-6">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">API Proxy per App Esterne</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Usa questo token per chiamare Lovable AI dalle tue app esterne. Il proxy supporta l'API OpenAI-compatible.
          </p>

          <div className="space-y-3">
            {/* API Token */}
            <div className="space-y-1.5">
              <Label className="text-xs">API Token</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={apiToken ? `${apiToken.slice(0, 8)}...${apiToken.slice(-8)}` : 'Nessun token generato'}
                  className="h-9 text-xs font-mono bg-secondary/50"
                />
                <Button variant="outline" size="sm" className="h-9 px-2" onClick={() => handleCopy(apiToken)} disabled={!apiToken}>
                  {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
                <Button variant="outline" size="sm" className="h-9 px-2" onClick={handleRegenerateToken} disabled={regenerating}>
                  {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>

            {/* Endpoint */}
            <div className="space-y-1.5">
              <Label className="text-xs">Endpoint</Label>
              <div className="flex gap-2">
                <Input readOnly value={proxyEndpoint} className="h-9 text-xs font-mono bg-secondary/50" />
                <Button variant="outline" size="sm" className="h-9 px-2" onClick={() => handleCopy(proxyEndpoint)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Usage Example */}
            <div className="space-y-1.5">
              <Label className="text-xs">Esempio di utilizzo</Label>
              <pre className="rounded-lg bg-secondary/50 p-3 text-[10px] font-mono text-foreground/80 overflow-x-auto">
{`curl ${proxyEndpoint} \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "messages": [
      {"role": "user", "content": "Hello!"}
    ],
    "model": "google/gemini-2.5-flash"
  }'`}
              </pre>
            </div>

            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5 mb-1">
                <Zap className="h-3 w-3 text-primary" />
                <span className="font-medium text-foreground">Modelli disponibili</span>
              </div>
              <p>google/gemini-2.5-pro, google/gemini-2.5-flash, openai/gpt-5, openai/gpt-5-mini, openai/gpt-5.2</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Settings;
