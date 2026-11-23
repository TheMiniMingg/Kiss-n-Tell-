# Owner mode (editing the live site)

The website has a hidden editor for the site owner. Open it with the small **Edit site** link at the bottom of the home screen, or go to `https://<your-site>/#edit`.

After the password, owner mode has two tabs:

- **Topics & questions**: the same pack editor as the desktop app, working on the game's own topics (`content/presets`). Change titles, questions and answers (Common, Rare, Legendary), the character, and the 11 stage images; preview a run; import or export a pack ZIP; add or delete topics.
- **Site text & links**: the logo text, tagline, topic heading, footer note, the donate button and social media links (`content/site.json`). Links must start with `https://`; a link left empty is kept as a placeholder and hidden from players.

**Saving** makes one commit to the repository with only the files that changed. The commit triggers a Vercel deploy, so players see the change after about 1 to 2 minutes. Everything stays in git, so any change can be undone by reverting its commit.

A topic that still has errors (for example fewer than 7 questions or missing images) is saved as a hidden draft in `content/presets/_<id>`, which the build skips, so a half-finished topic never breaks the live site. It goes live when you save it without errors. A topic that is already live can't be saved with errors.

## Setup (Vercel environment variables)

| Variable | Needed | What it is |
| --- | --- | --- |
| `EDIT_PASSWORD` | yes | The owner password. Mark it **Sensitive**. Never put it in the code: the repo is public. |
| `GITHUB_TOKEN` | yes, to save | A GitHub token that can write this repository's contents. See below. Mark it **Sensitive**. |
| `EDIT_SESSION_SECRET` | optional | Any long random text. Adds a second key to the session cookie signature. |
| `GITHUB_REPO` | optional | `owner/name`. Defaults to the repo Vercel deploys from. |
| `EDIT_BRANCH` | optional | Branch to commit to. Defaults to `main` in production, and to a preview deployment's own branch on previews. |

Add them in the Vercel dashboard under **Project → Settings → Environment Variables**, then redeploy.

**GitHub token:** on GitHub, open **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**. Choose the account that owns the repository as the resource owner, select **Only select repositories** and pick this repository, and under **Repository permissions** set **Contents** to **Read and write**. Nothing else is needed. Paste the token straight into Vercel; don't share it anywhere else. If the token expires, owner mode says so when it can't read the content; make a new one and update the variable.

## Security

- The password is only checked on the server (`api/_lib/handler.ts`). A correct password gets a signed session cookie (HttpOnly, Secure, SameSite=Strict, 12 hours). Changing `EDIT_PASSWORD` signs every session out.
- Wrong passwords: 5 wrong tries from one IP within 15 minutes lock that IP out for 15 minutes, doubling on each further lockout up to a day. 25 wrong tries from all IPs together lock the unlock for everyone for 15 minutes. Each wrong try also waits about half a second. The counters live in the function's memory, so a cold start resets them.
- For a durable limit as well, add a Vercel Firewall rate-limit rule in the dashboard (**Firewall → Configure → New rule**): if the request path equals `/api/edit` and the query `op` equals `unlock`, rate limit to about 10 requests per 10 minutes per IP.
- The server only writes `content/site.json` and the files a topic folder may contain (`content/presets/<id>/topic.json`, `questions.csv`, `character/character.json`, `character/00-10.<webp|png|jpg|jpeg|svg>`). Code, config and workflows can't be changed from the site.
- Requests must carry an `X-KNT-Editor` header and come from the same origin, so other sites can't use the owner's cookie.
- Uploaded images are limited to 4 MB each (Vercel's request limit is 4.5 MB). WebP is the best choice for size.
