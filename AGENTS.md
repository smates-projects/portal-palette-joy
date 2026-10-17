<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- All data goes through `src/lib/api/` repositories (mock now, http later via `VITE_API_MODE`); components only use the TanStack Query hooks in `src/lib/api/hooks.ts`, never seed data. Why: the real backend is a separate Laravel API and must be swappable.
- Blocked/overdue are computed in `src/lib/api/computed.ts`, never stored as statuses. Why: they depend on dependencies and the fixed TODAY in `src/config/app.ts`.
- No UI text in components: all copy lives in `src/locales/{es,en}.json`. Why: bilingual app.
- Routing is TanStack Router (file routes), not React Router. Why: fixed by the platform.
- The menu per role lives in `src/components/layout/nav.ts` (`navFor(role)`); screens are shared across roles and branch on `useCurrentUser().role`. Why: owner and firm reuse Mis tareas, detail and Reporte.
- Franchisability is computed in `src/lib/api/franchisability.ts` and returned by the businesses repository, never in components. Why: the Laravel backend will compute it the same way.
- Seed tasks take name and acceptance from `src/data/catalogo_metodo180.json`, never typed by hand. Why: the catalog is official and only SM Global edits it.
- SM edits (reassign, due date, step, cancel) go only through `tasks.update` / `tasks.cancel`, which log a `TaskEvent` with `change` and notify the firm (`task_updated`); sentences come from `src/lib/tasks/changes.ts`. Why: Activity and notifications must say the same thing.
- SM scope = businesses whose `office_id` is the user's office; Mis tareas defaults to `supervisor_user_id = me` unless `sup=all`. Cancelled tasks are excluded from `tasks.list()` unless `include_cancelled`. Why: no cross-office data, and cancelled work never counts toward progress.
- Leads go only through `LeadsRepository` (`api.leads`), SM only and scoped to the user's office; valid stage moves live in `src/lib/leads/pipeline.ts` (`resolveLeadMove`), used by both UI and mock. Why: board, detail and backend must agree on transitions.
- New program tasks are generated in `src/lib/api/program.ts` from the catalog (catalog `start_day`/`due_day` override the default window rule). Why: the Laravel backend will generate them the same way when a contract is signed.
- Office screens (Negocios, Catálogo y equipo, Configuración) derive rows in `src/lib/tasks/office.ts`; a business's consultant is its own `consultant_id` (inherited from the lead on contract signing, changed only via `businesses.setConsultant`, which logs a `BusinessEvent`); catalog is read via `useCatalog`. Why: the backend stores the consultant on the business.
- Roles: sm_global (SM Global), ishop (Business Bishop) and ranchisee are roles; the franchisor is NOT a role but a usiness_owner whose business has status: "franchisor" (useIsFranchisor()). Menus per role live in 
av.ts; / branches by role in src/routes/index.tsx. Why: one owner account keeps working through the whole life of the business.
- Feature folders so engineers do not collide: src/components/global/* (SM Global), owner/* (manual, documents, numbers, business, franchisor, franchises), ishop/*, ranchisee/*. Route files only import the page component from there; copy lives in the matching i18n namespace (global, owner_extra, ishop, ranchisee). Why: parallel work without merge conflicts.
- Franchise fees (royalty 5%, marketing fund 3%) are computed only in src/lib/franchise/fees.ts from src/config/economics.ts; the Bishop profit split in that file is PROVISIONAL and changes only there. Why: one source for sales reports, projections and tests.
- Platform rules (franchisability goal, required tasks, amber days) and the catalog are edited only by SM Global through pi.rules / pi.catalog (logged); components read them with useRules() / useCatalog(), never from constants. Catalog edits apply to new programs only. Why: existing programs keep the tasks they were generated with.
- Entry flow (NDA, MOU, due diligence documents) is computed in `src/lib/leads/onboarding.ts` (review clock, approval gate, admin check) and stored by the mock in `src/lib/api/mock/intake.ts`; signing goes only through `documents.openContract/signContract/declineContract` and the UI uses `src/components/docuseal/DocuSealSigner.tsx`. Why: the real DocuSeal embed and the Laravel backend replace these without touching screens.
- Businesses in `onboarding` are hidden from program screens (`businesses.list` for SM, network stats); they live in the Embudo and the owner's "Tu ingreso". Why: they have no program yet.
