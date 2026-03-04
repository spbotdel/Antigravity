# ROADMAP — Antigravity

*Phased plan for framework-first delivery and later Vibe Kanban adoption*

## Phase 0 — Completed

- [x] Adopt the framework in the main Antigravity repository.
- [x] Add project memory and session lifecycle files.
- [x] Establish README-level project workflow and priorities.

## Phase 1 — Supabase Recovery and Stabilization

- [ ] Find the missing Supabase-enabled application slice.
- [ ] Choose the canonical branch or codebase for continued delivery.
- [ ] Inventory env, auth, schema, RLS, and runtime assumptions.
- [ ] Stabilize one reproducible golden path.
- [ ] Remove Supabase as the main delivery blocker.

## Phase 2 — Minimal Vibe Kanban Adoption

- [ ] Introduce Vibe Kanban only after Supabase stabilization.
- [ ] Use it first for issue decomposition, review, and one or two isolated workspaces.
- [ ] Keep framework lifecycle unchanged inside each workspace.

## Phase 3 — Mixed Parallel Workflow

- [ ] Run one main integration stream plus up to 2-3 focused workspaces.
- [ ] Treat Vibe Kanban as the task and review layer.
- [ ] Treat the framework as the session and context layer.
- [ ] Gate `.claude/*` synchronization through integration, not every feature branch.
