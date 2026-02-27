
# Piano di Implementazione Ottimizzato

## Problemi Attuali Identificati

1. **6 errori di build TypeScript** (`TS18046`): tutti i catch block nelle Edge Functions usano `error.message` senza type assertion — Deno strict mode richiede `(error as Error).message`
2. **AI richiede file aperti manualmente**: `buildFileContext()` usa solo `openFiles` — se nessun file è aperto, l'AI non ha contesto
3. **Commit singolo per file**: `handleApplyPatches` fa un loop con `commitFile` uno alla volta — se fallisce a metà, solo alcuni file vengono committati
4. **Nessun messaggio "modifica applicata" in chat** dopo il commit
5. **Nessuno storico chat per progetto**: ogni volta che si apre un workspace si crea una nuova sessione, perdendo la cronologia
6. **Bottone cestino troppo vicino alla freccia** nella card progetto
7. **Limite 5 repository** hardcoded nel backend

---

## Step 1 — Fix errori di build (6 file Edge Functions)

Aggiungere `(error as Error)` in tutti i catch block:
- `ai-chat/index.ts` riga 295
- `ai-execute/index.ts` riga 289
- `ai-proxy/index.ts` riga 115
- `github-auth/index.ts` riga 148
- `gitmind-api/index.ts` righe 156 e 421

## Step 2 — Auto-fetch contesto file dal repo

Modificare `AiPanel.tsx` e `Workspace.tsx`:
- Quando si apre il workspace, dopo il fetch del tree, salvare la lista file in stato
- In `AiPanel`, se `openFiles` è vuoto, fare auto-fetch dei file rilevanti dal tree (es. max 8 file principali: `src/` con estensioni `.tsx`, `.ts`, `.css`) usando `api.fetchFile`
- Passare il contesto auto-recuperato all'AI come `fileContext`
- Mostrare indicatore "N file auto-caricati come contesto"

## Step 3 — Commit multi-file atomico + messaggio in chat

Modificare `handleApplyPatches` in `AiPanel.tsx`:
- Dopo il loop di commit completato con successo, aggiungere un messaggio assistant in chat: "✅ Modifica applicata: N file aggiornati su GitHub"
- Salvare il messaggio nel DB con `api.saveChatMessage`
- Per il problema commit parziale: aggiungere try/catch granulare e mostrare report finale (N successi, N fallimenti)

## Step 4 — Storico chat per progetto

Modificare la logica sessione in `Workspace.tsx`:
- Invece di creare sempre una nuova sessione, cercare prima una sessione esistente per quel `repoId` (query `sessions` con `repo_id` e `mode='chat'` ordinata per `updated_at DESC`)
- Se esiste, riutilizzarla (la chat history si carica automaticamente)
- Se non esiste, crearne una nuova
- Aggiungere endpoint `session.findOrCreate` in `gitmind-api`

## Step 5 — Riposizionare bottone cestino nella Dashboard

Modificare `Dashboard.tsx`:
- Spostare il bottone Trash2 in basso a destra nella card, separato visivamente dalla freccia (che è in alto a destra)
- Aggiungere padding e separazione visiva

## Step 6 — Aumentare limite repository

Modificare `gitmind-api/index.ts`:
- Cambiare il limite da 5 a 50 nel case `repo.attach`
- Aggiornare il contatore nel frontend Dashboard da `5` a `50`

---

## File da modificare

| File | Modifica |
|------|----------|
| `supabase/functions/ai-chat/index.ts` | Fix TS18046 |
| `supabase/functions/ai-execute/index.ts` | Fix TS18046 |
| `supabase/functions/ai-proxy/index.ts` | Fix TS18046 |
| `supabase/functions/github-auth/index.ts` | Fix TS18046 |
| `supabase/functions/gitmind-api/index.ts` | Fix TS18046 x2, session.findOrCreate, limite 50 |
| `src/components/workspace/AiPanel.tsx` | Auto-fetch contesto, messaggio post-commit |
| `src/pages/Workspace.tsx` | Passare tree al AiPanel, findOrCreate sessione |
| `src/pages/Dashboard.tsx` | Riposizionare cestino, limite 50 |
| `src/lib/api.ts` | Aggiungere `findOrCreateSession` |
