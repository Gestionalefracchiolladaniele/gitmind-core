

# Piano di Ottimizzazione GitMind AI

## Problemi Identificati

1. **La chat AI non modifica i file** - L'AI risponde solo con testo/domande invece di applicare modifiche ai file del repository
2. **Action Pipeline fallisce** - Lo stato mostra FAILED (errore nella pipeline di esecuzione)
3. **Il ripristino (revert) cancella solo i messaggi** - Non ripristina lo stato dei file

## Funzionalita Richieste

1. **Impostazioni API Key** - Pagina/pannello per scegliere tra Lovable AI o chiavi API personali (OpenAI, Gemini, ecc.)
2. **Proxy API per app esterne** - Endpoint che permette ad app esterne di usare Lovable AI tramite il tuo progetto
3. **Revert con ripristino file** - Cliccando "ripristina" i file tornano allo stato salvato nel contesto di quel messaggio

---

## Fase 1: Fix Chat AI - Abilitare Modifiche ai File

**Problema**: L'AI nella chat risponde solo con testo generico e non applica le modifiche ai file.

**Soluzione**: Migliorare il sistema prompt della funzione `ai-chat` per generare patch unificate quando l'utente chiede modifiche, e aggiungere logica nel frontend per riconoscere e applicare le patch direttamente.

- Aggiornare `supabase/functions/ai-chat/index.ts`:
  - Il system prompt istruira l'AI a restituire patch in formato unificato quando vengono richieste modifiche
  - Aggiungere parsing della risposta per separare spiegazione e patch
  - Restituire struttura `{ reply, patches?, commitMessage? }` invece di solo `{ reply }`

- Aggiornare `AiPanel.tsx`:
  - Riconoscere quando la risposta contiene patch
  - Mostrare pulsante "Applica modifiche" che chiama `github.commitFile` per ogni file modificato
  - Aggiornare il contenuto locale dei file dopo l'applicazione

## Fase 2: Fix Action Pipeline

**Problema**: La pipeline Action mostra FAILED. La transizione di stato `IDLE -> PLANNING` funziona ma le chiamate successive falliscono.

**Soluzione**:
- La funzione `handleExecuteAction` in `AiPanel.tsx` chiama `onStateChange` che tenta una transizione backend. Il backend richiede transizioni valide ma il codice frontend le forza senza attendere la risposta.
- Separare la logica: le transizioni di stato nella pipeline Action saranno gestite localmente (solo UI) senza chiamare il backend per ogni step, e il risultato finale aggiornera il backend.
- Aggiungere gestione errori visibile con toast per ogni step fallito.

## Fase 3: Impostazioni API Key

**Nuovo pannello "Settings" accessibile dalla Dashboard o dal Workspace.**

- Migrazione DB: nuova tabella `user_settings` con colonne:
  - `user_id` (uuid, PK, riferimento a users)
  - `ai_provider` (text: 'lovable' | 'openai' | 'gemini' | 'anthropic')
  - `custom_api_key` (text, cifrato - la chiave dell'utente)
  - `created_at`, `updated_at`

- Nuova pagina `src/pages/Settings.tsx`:
  - Selezione provider AI (Lovable AI gratuito, OpenAI, Gemini, Anthropic)
  - Campo per inserire la chiave API personale
  - Salvataggio sicuro nel database

- Aggiornare `ai-chat` e `ai-execute`:
  - Leggere le impostazioni dell'utente dal DB
  - Se `ai_provider != 'lovable'`, usare la chiave custom con l'endpoint del provider scelto
  - Altrimenti usare Lovable AI Gateway come default

## Fase 4: Proxy API per App Esterne

**Nuova edge function `ai-proxy` che permette ad app esterne di usare Lovable AI.**

- Creare `supabase/functions/ai-proxy/index.ts`:
  - Accetta richieste con header `Authorization: Bearer <user_api_token>`
  - Proxy verso Lovable AI Gateway
  - Rate limiting per utente

- Migrazione DB: aggiungere colonna `api_token` alla tabella `user_settings`
  - Token generato automaticamente, visibile nelle Settings
  - L'utente lo copia e lo usa nella sua app esterna

- Nella pagina Settings:
  - Sezione "API Token" con token generabile/rigenerabile
  - Istruzioni e endpoint da usare nell'app esterna
  - Esempio di chiamata cURL/fetch

## Fase 5: Revert con Ripristino File

**Problema**: Il revert attuale cancella solo i messaggi successivi ma non ripristina i file.

**Soluzione**: Ogni messaggio AI gia salva `file_context` (snapshot dei file). Il revert utilizzera questo snapshot per sovrascrivere i file nel repository.

- Aggiornare `AiPanel.tsx`:
  - Quando l'utente clicca "Ripristina qui":
    1. Recuperare il `file_context` del messaggio target
    2. Per ogni file nel contesto, fare commit su GitHub con il contenuto salvato
    3. Aggiornare `fileContents` locale con i file ripristinati
    4. Cancellare i messaggi successivi (come gia fa)
  - Mostrare conferma prima del ripristino ("Questa azione sovrascrivera i file attuali")
  - Mostrare progresso durante il ripristino dei file

- Aggiornare il salvataggio dei messaggi:
  - Salvare il `file_context` anche sui messaggi dell'assistente (non solo dell'utente) per avere lo snapshot completo ad ogni punto

---

## Dettagli Tecnici

### Struttura File Modificati/Creati

```text
MODIFICATI:
  supabase/functions/ai-chat/index.ts      -- prompt migliorato + output strutturato
  supabase/functions/ai-execute/index.ts    -- supporto custom API keys
  supabase/functions/gitmind-api/index.ts   -- azioni user_settings CRUD
  src/components/workspace/AiPanel.tsx      -- applicazione patch, revert file, UI migliorata
  src/pages/Workspace.tsx                   -- passaggio props aggiuntive
  src/lib/api.ts                           -- nuovi endpoint settings + proxy
  src/App.tsx                              -- rotta /settings

CREATI:
  supabase/functions/ai-proxy/index.ts     -- proxy API per app esterne
  src/pages/Settings.tsx                   -- pagina impostazioni API
  supabase/migrations/xxx_user_settings.sql -- tabella user_settings
```

### Flusso Revert Migliorato

```text
Utente clicca "Ripristina qui" su messaggio N
    |
    v
Conferma dialog ("I file torneranno allo stato del messaggio N")
    |
    v
Leggi file_context del messaggio N
    |
    v
Per ogni file nel contesto:
  -> commitFile(path, contenuto_salvato, sha_attuale)
  -> Aggiorna fileContents locale
    |
    v
Cancella messaggi dopo N dal DB
    |
    v
Aggiorna UI chat + file viewer
```

