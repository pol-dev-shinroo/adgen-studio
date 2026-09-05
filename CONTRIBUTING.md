# Contributing to AdGen Studio

Two people (and their own Claude Code sessions) now work in this repo. Read this before pushing.

## Git workflow

This project has run entirely on direct-to-`main` commits so far, which worked with one person driving.
With two people (plus AI agents making commits on both sides), that's no longer safe by default — the risk
isn't malice, it's two unrelated changes landing on the same lines around the same time. Minimum rules
going forward:

1. **`git pull` before starting any new work session**, every time, no exceptions — including at the start
   of a fresh Claude Code conversation, before it reads any file it's about to edit.
2. **Small, frequent commits** — the existing convention (one commit per "Part," i.e. one logical unit of
   work) already does this. Keep doing it. A commit that bundles multiple unrelated Parts together makes it
   much harder for the other person to tell what changed.
3. **Push promptly after a Part is verified working** — don't let more than one Part's worth of work sit
   unpushed locally. The longer it sits, the more likely it collides with something the other person did.
4. **If you're about to touch a file you didn't just write yourself**, `git pull` again immediately before
   editing it, and skim the last few commits touching that file (`git log -p -3 -- path/to/file`) so you
   know what's already there and why.
5. **Merge conflicts**: resolve by understanding both sides' actual intent (read both commits' messages/
   comments), not by mechanically picking one side — a conflict in `renderImage.service.js`'s prompt text,
   for instance, likely means two real fixes need to be combined, not that one should simply overwrite the
   other. When genuinely unsure, stop and ask the other person rather than guessing.

If direct-to-`main` starts causing real collisions in practice, switch to short-lived feature branches (one
per Part) + a quick review before merging — don't wait for a bad collision to force the conversation.

## Before calling anything "done"

Every `claude-code-prompts/claude-code-prompt-part-<letter>.md` file so far ends with a "Verify" section
that requires live testing, not just a passing test suite. Keep that standard:

1. `npm test` in both `backend/` and the repo root must pass. Also run `npm run typecheck` in `backend/` —
   it's a separate script, not implied by `npm test`.
2. For any change to a generation-pipeline prompt (`backend/src/services/generation/*.js`), run at least
   one real generation and read the actual output — image and/or copy — yourself. A prompt-text change with
   only a mocked-call unit test behind it is not verified.
3. For any deployment-affecting change, confirm the live Vercel/Railway deployment is actually running the
   new commit (check the deployed commit hash), not just that a push succeeded.
4. Write (or update) a `claude-code-prompts/claude-code-prompt-part-<next-letter>.md` file documenting what
   was found and fixed, following the existing files' format — this is the project's shared memory across
   sessions and between the two of you; don't skip it just because the fix felt small.

## Secrets

Never commit `.env`, `.env.test-login`, or any real API key/credential — check `.gitignore` covers whatever
new secret file you introduce before your first commit involving it. The app's own credentials vault
(설정 → 자격 증명) is the real source of truth for the deployed backend; `backend/.env` is only for local
dev and should never contain anything that isn't also safe to lose.
