# Frontend working rules

- Use Nub for dependency management and script execution (`nub add`, `nub ci`, `nub run`, `nub exec`, `nub dlx`). Keep `nub.lock` and the pinned package-manager version consistent across local development, Docker and CI.
- Keep the frontend on Vite + React + TypeScript. Use TanStack Router for application routes and TanStack Query for backend state. FastAPI owns the existing backend contracts.
- Before adding or changing a UI component, search the official shadcn/ui documentation (https://ui.shadcn.com/docs/components) for an existing component or composition that fits. Inspect existing local components too. Create a custom component only when neither fits; explain that choice briefly in the implementation notes.
- Treat the chosen shadcn preset as the shared visual baseline. Reuse its structure, semantic theme tokens, sizes and variants. Prefer existing variants; when a new reusable appearance is needed, extend the component's variant definition instead of copying its markup or repeating overrides at call sites.
- Keep decoration restrained. Avoid arbitrary per-instance colors, backgrounds, padding, radii and shadows. Use shared spacing and semantic tokens, with limited, consistent status/chart colors. Layout classes for responsive positioning are appropriate.
- Put repeated visual decisions into a shared component, variant or theme token. Preserve accessibility, focus states and keyboard behavior when composing components.
- Display real, simulated, stale and unavailable data truthfully. Distinguish classification from physical completion. Browser inference tests must not claim to control hardware or complete a real sort.
- Verify UI changes at desktop and mobile sizes and run the relevant Nub lint, test and build commands. Never trigger paid inference or motor movement just to check frontend rendering.

Read the [root baseline](../AGENTS.md) and [frontend workflow](README.md) as well.
The navigation/building-preview browser specs use fixtures; the dashboard
integration spec requires an isolated mock backend. Keep tests versioned and
exclude test artifacts from shipped images instead of hiding regressions in Git.
