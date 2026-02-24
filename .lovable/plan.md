

## Analisi dei Problemi

Ho identificato **2 problemi distinti** dalle tue screenshot:

### Problema 1: Errore nel salvataggio delle impostazioni AI
La pagina Impostazioni mostra l'errore `"new row for relation 'user_settings' violates check constraint 'valid_ai_provider'"`.

**Causa**: Il database ha un vincolo CHECK che accetta solo `'lovable', 'openai', 'gemini', 'anthropic'`, ma il codice invia i nomi completi dei modelli come `openai/gpt-5.2` o `google/gemini-3-flash-preview`.

### Problema 2: L'AI chat ha rotto l'app dopo un commit
L'AI ha modificato `src/index.css` per cambiare il colore e dopo il commit l'app non si carica più. Il sistema di protezione file attuale blocca troppi file ma non protegge abbastanza a livello client.

---

## Piano di Implementazione

### Step 1: Correggere il vincolo database
- Eseguire una migrazione SQL per aggiornare il CHECK constraint `valid_ai_provider` affinché accetti tutti i nomi modello completi utilizzati nel codice (es. `google/gemini-3-flash-preview`, `openai/gpt-5.2`, etc.)

### Step 2: Correggere il file index.css
- Verificare e ripristinare il file `src/index.css` al contenuto corretto (il tema viola originale, che risulta già corretto nel codice attuale)

### Step 3: Aggiungere validazione client-side prima del commit
- Modificare `AiPanel.tsx` per aggiungere un controllo sui file protetti **prima** di eseguire il commit su GitHub, così da avere una doppia protezione (server + client)
- Aggiungere un controllo di "anteprima diff" che mostra all'utente cosa cambierà prima di applicare

### Step 4: Migliorare il sistema di protezione nell'edge function
- Rimuovere file come `README.md` dalla lista bloccata (è un file legittimamente modificabile)
- Mantenere bloccati solo i file di configurazione critica: `.env`, `package.json`, `tsconfig.*`, `vite.config.*`, `tailwind.config.*`, `index.html`
- Aggiungere nel sistema prompt AI l'istruzione di **non generare CSS/codice che rompa la sintassi** e di includere sempre il contenuto completo del file

### Dettagli Tecnici

```text
Flusso protezione aggiornato:

  Utente chiede modifica
         │
    AI genera patches
         │
  ┌──────▼──────┐
  │ Server-side  │ → Filtra file config critici
  │ (ai-chat)    │ → Blocca pattern pericolosi
  └──────┬──────┘
         │
  ┌──────▼──────┐
  │ Client-side  │ → Verifica file protetti
  │ (AiPanel)    │ → Mostra anteprima
  └──────┬──────┘
         │
    Utente approva → Commit su GitHub
```

**Migrazione SQL:**
```sql
ALTER TABLE user_settings DROP CONSTRAINT valid_ai_provider;
ALTER TABLE user_settings ADD CONSTRAINT valid_ai_provider 
  CHECK (ai_provider = ANY (ARRAY[
    'lovable',
    'google/gemini-2.5-pro',
    'google/gemini-2.5-flash', 
    'google/gemini-2.5-flash-lite',
    'google/gemini-3-flash-preview',
    'google/gemini-3-pro-preview',
    'google/gemini-3-pro-image-preview',
    'openai/gpt-5',
    'openai/gpt-5-mini',
    'openai/gpt-5-nano',
    'openai/gpt-5.2'
  ]));
```

**File modificati:**
- Migrazione SQL (nuovo vincolo)
- `src/components/workspace/AiPanel.tsx` (validazione client-side)
- `supabase/functions/ai-chat/index.ts` (lista protezione aggiornata)
- `supabase/functions/ai-execute/index.ts` (lista protezione aggiornata)

