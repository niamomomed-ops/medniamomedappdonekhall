## Phase 1 — Fondation (ce prompt)

### 1. SQL à exécuter manuellement (SQL Editor)

Script unique fourni dans le chat, qui crée :

- `backup_settings` (1 ligne, id='singleton') : flags daily/weekly/monthly/on_caisse_close, heure, jour, listes emails, drive_folder_id, formats[]
- `backup_runs` (historique) : trigger, destinations, formats, status, total_rows, error, started_at/ended_at
- RPC `list_public_tables()` SECURITY DEFINER → permet la resynchronisation automatique de la liste des tables (utilisée par le reset, JSON, SQL)
- Grants + RLS admin uniquement
- Snippet pg_cron (à éditer avec l'URL projet + secret) pour daily/weekly/monthly appelant `/api/public/hooks/run-scheduled-backup`

### 2. Frontend (TanStack / React)

- `src/lib/backup.functions.ts` :
  - `listAllTables()` — appelle la RPC, fallback liste statique
  - `getBackupSettings()` / `saveBackupSettings()`
  - `runBackupNow({ trigger })` — génère JSON + SQL côté serveur (réutilise la logique existante), enregistre une ligne dans `backup_runs`, retourne `{ jsonBase64, sqlBase64, totalRows, runId }`. Phase 1 : pas encore d'envoi externe.
  - `listBackupRuns()` — 20 dernières lignes
- `src/lib/settings.functions.ts` : utilise `list_public_tables` RPC pour resynchroniser dynamiquement la liste exportée (JSON + SQL), au lieu de la liste figée actuelle.
- `src/routes/dashboard.parametres.tsx` :
  - `TABLES` et `SELECTIVE_TABLES` dérivés de la RPC à l'ouverture de la page (avec fallback)
  - Nouveau bloc `BackupScheduleCard` : fréquences (4 cases), heure / jour, destinations (cases email + Drive), liste d'emails (chips), Drive folder ID, formats (JSON / SQL), bouton « Sauvegarder maintenant », tableau des 20 dernières exécutions
- `src/components/CloseCaisseButton.tsx` : après succès de `closeCaisse`, si `on_caisse_close=true`, appelle `runBackupNow({ trigger: 'caisse_close' })` (best-effort, ne bloque pas la fermeture).
- `src/routes/api/public/hooks/run-scheduled-backup.ts` : POST `{ trigger }`, vérifie l'en-tête `X-Backup-Secret` contre `BACKUP_CRON_SECRET`, appelle `runScheduledBackup` (service role).

### 3. À votre charge avant la phase 2

- Exécuter le SQL fourni
- Décider du provider email : **Resend** (connecteur Lovable, recommandé) ou **Lovable Emails** (template + domaine vérifié)
- Connecter **Google Drive** (connecteur Lovable, OAuth en un clic)
- Ajouter le secret `BACKUP_CRON_SECRET` (généré par vos soins) pour authentifier les appels pg_cron

## Phase 2 — Livraison Email + Drive (prompt suivant)

- Ajout dans `runBackupNow` de l'envoi pièces jointes via Resend (gateway connecteur) ou Lovable Emails
- Upload multipart vers Drive via le gateway Google Drive
- Mise à jour `backup_runs.status` (success / partial / failed) + détails par destinataire

## Pourquoi en deux étapes

Activer email et Drive avant que les connecteurs ne soient liés produit du code mort qui échoue avec « connector not linked ». Mieux vaut livrer la fondation tout de suite, vous laisser brancher les deux services, puis câbler la livraison sans risque.
