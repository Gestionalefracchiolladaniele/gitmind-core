import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Loader2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

  useEffect(() => {
    if (!user) { navigate('/'); return; }
    loadSettings();
  }, [user]);

  const loadSettings = async () => {
    if (!user) return;
    try {
      const data = await api.getUserSettings(user.id);
      if (data?.ai_provider) {
        setSelectedModel(data.ai_provider);
      }
    } catch {
      // No settings yet
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await api.saveUserSettings(user.id, {
        ai_provider: selectedModel,
        custom_api_key: null,
      });
      toast({ title: 'Impostazioni salvate', description: `Modello: ${selectedModel}` });
    } catch (e: any) {
      toast({ title: 'Errore', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

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
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Modello AI</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Scegli quale modello AI utilizzare per la chat. Se uno non funziona, seleziona un altro.
          </p>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Modello</Label>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODELS.map(m => (
                    <SelectItem key={m.value} value={m.value} className="text-xs">
                      <div>
                        <span className="font-medium">{m.label}</span>
                        <span className="ml-2 text-muted-foreground">— {m.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button onClick={handleSave} disabled={saving} size="sm" className="h-8 text-xs">
              {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}
              Salva Impostazioni
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Settings;
