# Contributing — Contabox

Thanks for your interest. This is a pre-alpha project; expect churn.

---

## Getting Started

```bash
# Clone and install
git clone https://github.com/<owner>/contabox
cd contabox
pnpm install

# Dev mode (auto-reload)
pnpm dev

# Load in Firefox
# 1. about:debugging#/runtime/this-firefox
# 2. "Load Temporary Add-on"
# 3. Select dist/manifest.json
```

Or use `web-ext`:

```bash
pnpm web-ext run
```

---

## Code Style

- TypeScript strict mode, `noUncheckedIndexedAccess: true`
- Biome for lint + format (run `pnpm check`)
- Conventional Commits for messages: `feat(scope): …`, `fix(scope): …`, etc.
- No `any` without comment explaining why
- All cross-context messages typed via `shared/messaging.ts` with Zod schemas

---

## Branch Naming

- `feat/<scope>-<short-desc>` — new feature
- `fix/<scope>-<short-desc>` — bug fix
- `chore/<short-desc>` — tooling, docs, deps
- `m<N>/<feature>` — milestone work

---

## Pull Request Process

1. Branch from `main`
2. Run `pnpm check && pnpm test`
3. Add/update tests for behavior changes
4. Update docs if you change architecture, features, or APIs
5. Update QA checklist if introducing a new manual test surface
6. Fill out PR template
7. CI must pass before merge

---

## Testing

```bash
pnpm test            # Vitest unit tests
pnpm test:e2e        # Playwright (requires Firefox)
pnpm test:watch
```

Add unit tests for every engine function. Add E2E test for any new user-facing flow at M3+.

---

## Module Conventions

Each background module exports:
- A class or factory (e.g., `ContainerManager`)
- A `Command` union extension for its operations
- A handler function for `runtime.onMessage`

UI components:
- Functional components only
- Hooks colocated in `hooks/`
- No prop drilling > 2 levels — extract to Zustand store

---

## Adding a Feature

1. Write spec (or update `FEATURES.md`) before code
2. Update data model in `shared/types.ts` and `shared/db.ts`
3. Add Zod schema in `shared/schemas.ts`
4. Implement engine logic in `background/<engine>.ts`
5. Wire command in `background/command-router.ts`
6. Build UI surface
7. Add unit tests
8. Add to QA checklist if user-visible
9. Update relevant docs

---

## Security

- See `SECURITY.md` for threat model
- Never log sensitive data (passwords, cookies)
- Never put vault keys in content scripts
- Validate all message payloads with Zod
- New permissions in `manifest.json` require justification in PR description

---

## Performance

Stay within budgets (`TECH_STACK.md` → Performance Targets). If a PR makes sidebar paint > 200ms with 100 containers, fix or get explicit waiver.

Tools:
- React DevTools Profiler
- Firefox Performance panel
- `pnpm analyze` (bundle size)

---

## Documentation

Docs live in `docs/`. When you change behavior, update:
- `FEATURES.md` if user-visible
- `ARCHITECTURE.md` if structural
- `ROADMAP.md` if milestone scope shifts
- `QA.md` if there's a new manual test
- `SECURITY.md` if new threat surface

---

## Communication

- Issues: bug reports, feature requests
- Discussions: design questions
- Discord/Matrix: TBD post-beta

---

## License

By contributing, you agree your contributions are licensed under the project license (TBD: MIT or AGPL-3.0, decided before public beta).
