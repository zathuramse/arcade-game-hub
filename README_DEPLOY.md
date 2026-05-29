# Cloudflare Pages deploy

This folder is the clean static deploy bundle for the arcade collection.

Deploy settings:

- Framework preset: None
- Build command: empty
- Build output directory: `.`
- Root URL redirects to `game-collection/index.html`

Manual deploy command:

```powershell
npx wrangler pages deploy . --project-name arcade-game-hub
```

After the first deploy, Cloudflare Pages will provide a permanent free `*.pages.dev` URL.
