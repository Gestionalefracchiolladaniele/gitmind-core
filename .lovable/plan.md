
Obiettivo: eliminare gli errori (redirect_uri + preview non buildata), aggiungere API key Gemini/OpenAI in Impostazioni, e rendere le modifiche AI stabili senza uscire dallo stack Lovable.

1) Blocco immediato (subito)
- Configurare nella GitHub OAuth App entrambe le callback:
  - `https://id-preview--bd003e4d-a27f-4384-bf7f-00ad2d21f1b0.lovable.app/auth/callback`
  - `https://gitmind-core-flow.lovable.app/auth/callback`
- Lasciare attivo il login Demo come fallback sempre disponibile.
- Se la preview resta in “not built yet”, ripristinare l’ultima versione stabile e poi applicare i fix sotto in ordine.

2) Stabilità build (evitare schermata “Preview has not been built yet”)
- Consolidare strategia dipendenze/lockfile (un solo flusso installazione coerente con build).
- Mantenere `tailwindcss-animate` installato e rendere il plugin Tailwind robusto a missing module (fallback controllato, senza crash build).
- Aggiungere check pre-commit lato AI per bloccare patch che toccano file di build/config critici.

3) Impostazioni: API key Gemini/OpenAI (oltre selezione modello)
- Estendere pagina Settings con:
  - toggle “Usa chiave personale”
  - provider key: `OpenAI` / `Gemini`
  - input password-masked della chiave
  - stato chiave salvata (es. “••••1234” + pulsante sostituisci/rimuovi)
- Salvare chiavi nel backend in modo non esposto al client (mai ritornare la chiave completa in GET impostazioni).
- Mantenere compatibilità con impostazioni attuali (`ai_provider` già presente) e aggiungere campi necessari per modalità custom.

4) Routing AI backend (modello + provider)
- Aggiornare backend chat:
  - se “chiave personale” attiva: usare adapter provider scelto (OpenAI/Gemini)
  - altrimenti usare provider integrato corrente (default stabile)
- Validare coerenza provider/modello (es. modello OpenAI solo con provider OpenAI).
- Uniformare gestione errori rate/credito e messaggi lato UI (toast espliciti).

5) Guardrail forti per non rompere struttura
- Aggiornare prompt in entrambi i backend AI (`ai-chat` e `ai-execute`) con regole hard:
  - stack consentito: React + Vite + TypeScript + Tailwind + shadcn + lucide
  - vietato introdurre Next/Vue/Angular/Svelte/backend runtime non previsto
  - vietato refactor non richiesto
  - vietato alterare struttura file non coinvolti
- Aggiungere validazione server-side patch:
  - blocco file protetti (già presente, da allineare e rendere unico)
  - blocco import/framework non consentiti
  - blocco patch troppo distruttive (soglia linee modificate / rewrite totale)
  - blocco output incompleto o sintassi manifestamente invalida (TS/JSON/CSS basic parse checks)

6) Sicurezza commit AI (prima di scrivere su GitHub)
- In `AiPanel` mostrare anteprima diff reale (linee aggiunte/rimosse + warning rischio).
- Applicazione patch solo dopo validazione backend “safe”.
- Commit con messaggio standard e consistente, con rollback rapido da ultimo snapshot conversazione.
- (Opzionale consigliato) passare a commit multi-file atomico per evitare stati parziali.

7) Piano test finale (end-to-end)
- Test 1: login GitHub da mobile preview + callback corretta.
- Test 2: login Demo sempre funzionante.
- Test 3: Settings salva modello senza errore.
- Test 4: Settings salva/rimuove key OpenAI e Gemini, senza mai mostrare chiave completa.
- Test 5: richiesta AI di modifica UI semplice -> patch applicabile -> build ok.
- Test 6: richiesta AI che prova tecnologia non consentita -> patch bloccata con messaggio chiaro.
- Test 7: verifica su GitHub che le modifiche siano mirate (non riscritture massive).

Dettagli tecnici (file da toccare)
- Frontend:
  - `src/pages/Settings.tsx`
  - `src/lib/api.ts`
  - `src/components/workspace/AiPanel.tsx`
- Backend functions:
  - `supabase/functions/ai-chat/index.ts`
  - `supabase/functions/ai-execute/index.ts`
  - `supabase/functions/gitmind-api/index.ts`
  - `supabase/functions/github-auth/index.ts` (solo UX/error clarity callback)
- Config/build:
  - `tailwind.config.ts`
  - `package.json` + lockfile coerente
- Migrazione database:
  - estensione `user_settings` per modalità key personalizzata (provider, flag attivo, metadati key) e hardening accesso dati sensibili.
