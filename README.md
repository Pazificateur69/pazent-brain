# pazent.brain 🧠

Knowledge base personnelle — accessible partout, éditeur markdown, dark mode.

## Stack
- **Next.js 14** — App Router
- **GitHub API** — Stockage des notes (repo privé)
- **Vercel** — Deploy gratuit

## Variables d'environnement (dans Vercel)

| Variable | Valeur |
|---|---|
| `GITHUB_TOKEN` | Token GitHub (scope: repo) |
| `GITHUB_OWNER` | `Pazificateur69` |
| `GITHUB_REPO` | `pazent-brain-notes` |
| `APP_PASSWORD` | Mot de passe de l'app |

## Deploy Vercel

1. Importer ce repo dans Vercel
2. Ajouter les 4 variables d'environnement
3. Deploy 🚀
