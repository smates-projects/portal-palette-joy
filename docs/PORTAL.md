# SM Platform: current state of the app

State at 17 October 2026, branch `main`. This file is the full picture that does not fit in the Lovable Knowledge. Read it before touching anything. Business rules live in the Knowledge; this file says what exists, where it lives and how it was built.

## How this repo is built

- Most of the app was built outside Lovable, directly in this repo, and is covered by 390+ Vitest tests (`npx vitest run`). The tests describe the expected behavior of the data layer: treat them as the specification.
- Lovable does presentation only (layout, responsive, visual consistency) unless a prompt explicitly asks for more.
- Never touch `src/lib`, `src/locales` or tests unless the prompt says so. If you see a logic or data problem, list it at the end of your answer and do not fix it.
- Reference screens for visual consistency (built in Lovable): Mis tareas, task detail, owner home, embudo board, lead detail.
- Demo date is fixed: `TODAY = 2026-10-14` (`src/config/app.ts`). "Ver como" switches the current user; it lives in memory and resets on reload.

## Map

Data and logic (`src/lib`):

- `api/types.ts`, `api/network-types.ts`, `api/entry-types.ts`: every entity, snake_case, UUID ids, ISO dates.
- `api/repositories.ts`: repository interfaces (Session, Organizations, Businesses, Users, Leads, Tasks, Notifications, Documents, Funds, Brand, BusinessProfile, Bishop, Rules, Catalog, Network, Franchises, Manual...).
- `api/hooks.ts`: TanStack Query hooks; components only use these.
- `api/mock/`: in-memory backend with authorization by current user (`index.ts`, `seed*.ts`, `intake.ts`, `funds.ts`, `accounts.ts`, `entry.ts`, `opportunities.ts`, `network.ts`).
- `leads/`: pure rules of the pipeline (`pipeline.ts`), entry documents and contracts (`onboarding.ts`), automatic entry and zones (`entry.ts`), assessment result (`readiness.ts`), "Ya lo tenía" (`prevalidation.ts`), funds and distribution (`funds.ts`).
- `brand/`: contrast (AA), detection of the brand from the manual (simulated), scope of the white label.
- `contracts/signature.ts`: sample signatures and document fingerprint.
- `tasks/`: task computations per role (owner, office, SM network).
- `data/catalogo_metodo180.json`: the official catalog of 87 services.

Screens (`src/components`):

- `layout/`: `AppShell` (rail, top bar, mobile menu, route guard, white label), `nav.ts` (menu per role).
- `pipeline/`: embudo (`PipelinePage`, `LeadViews`), `LeadDetail`, entry sections (phases, mail preview, meeting), `AssessmentResult`, `SimulateEntry`, `AddBusinessDialog`, `IntakeChecklist` (NDA, MOU, documents, review clock), `ManualLeadSection`.
- `business/BusinessFile.tsx`: the ficha del negocio (who it is, how it arrived, how it is doing, what is missing, activity, data change requests).
- `funds/`: Bishop funds and distribution to firms.
- `accounts/`: people, invitations, deactivation, firm dialogs shared helpers.
- `office/`: Catálogo y equipo (catalog, firms, SM team), `FirmDialogs`, businesses list.
- `global/`: SM Global screens (people, rules, structure, offices, global funnel, global catalog).
- `owner/`: owner screens (home, business with verified data, documents, numbers, manual, franchisor, franchises).
- `bishop/`: opportunities, agreements, portfolio, funds view.
- `franchisee/`: franchisee home, manual, payments, business.
- `docuseal/`: `SignaturePad` (draw, type, upload), `DocuSealSigner`, `SignedContractDialog`.
- `brand/`: `Logo` (SM marks from `public/brand`), `BrandLogo`, `BrandPanel`, `BrandCaptureSection`, `BrandPreview`.
- `tasks/`: list, calendar, detail (one component used everywhere), SM actions, pre-validation.

## Industries

Strategic Mates works only with construction trades, the same keys as the public assessment: `construction`, `remodeling`, `installations_repairs`, `maintenance`, `cleaning`, `other_related` (with free text `activity_other`). The list is data (`INDUSTRIES` in `src/lib/leads/pipeline.ts` plus labels in `pipeline.industries`): adding a trade later is adding an entry. Catalog entries marked "Construcción / mantenimiento" go to construction, remodeling, installations_repairs and maintenance only.

## Entry: from the assessment to the program

1. The public readiness assessment lives outside this app (strategicmates.com) and arrives by webhook with the exact keys of `Lead` and `LeadResult` in `src/lib/api/types.ts`: business ranges (`revenue_range`, `margin_range` or null = "No lo sé", `team_range`, `years_range`), `hispanic_owner` (yes / no / talk, informational only), result with `readiness` ready | on_track, `band` high | mid | low | track (by the shown score: 70, 55, 0), shown `score` 40-92, `eligibility_gaps` (`years_operating`), seven blocks (`time_team`, `work_quality`, `money`, `clients_sales`, `information`, `experience`, `direction`) rated strong | medium | weak | unknown, strengths and priorities, `know_how_example`.
2. Zones: each state or city belongs to an office (SM Global edits them in Reglas; default office SM Miami). The lead gets the office's default consultant.
3. Phases shown in the lead, in this order: assessment completed, meeting booked (Google Meet), summary email sent, meeting done. All automatic until the consultant writes the meeting note. The assessment sends no email: the person sees the result on screen with the "Agendar mi reunión" button (the consultant's calendar). Only the booking sends the summary email (headline, score, strengths, priorities) together with the date, time and Meet link of the meeting, so `summary_sent_at` never exists without a `meeting`. An evaluated lead without a booking shows "Esperando reserva", and "Sin reservar hace N días" from the second day after the assessment (`submitted_at`). The reminder to book after 2 days is sent by the future backend, not by this app. "Simular entrada" in the embudo creates leads and meetings for demos (SM only): "Simular assessment" creates the lead without email; "Simular reserva" creates the meeting and sends the summary.
4. Stages of the embudo: evaluated, meeting, documents, accepted, in_program, discarded. Manual leads (referrals, events) enter as "Manual" without result; SM can send them the assessment.
5. Documents: mutual NDA + MOU signed by owner and SM; then the owner uploads the due diligence documents (the list, the mandatory flags and the review deadline are SM Global rules). SM accepts each or asks for another with a comment. Review clock: 15 days by default, paused while a replacement is requested. Only admins (office or Global) approve the documentation.
6. The owner gets an account when SM sends NDA and MOU (business status `onboarding`); until `in_program` the owner sees only "Tu ingreso" and Documentos.
7. From NDA + MOU signed the lead is an opportunity for Bishops (view only, assessment data plus one verified fact per accepted document). "Aceptar oportunidad" only in accepted; the first Bishop takes it. The owner's contact is never shown to a Bishop.
8. Accepted: Bishop assigned, tripartite contract signed by the three, funds received in full; then `in_program` automatically: day 1 and tasks generated from the catalog.

## Program

- Diagnóstico (days 1-15), six areas in parallel (B1 to B6), Cierre y handoff (days 150-180). Every program gets the 48 "minimo" tasks that apply.
- "Ya lo tenía": the program is still 180 days at the same price, with fewer tasks. Tasks of the areas the assessment rated strong start as "A validar: el negocio ya lo tendría" (block to area map editable by SM Global in Reglas). In the Diagnóstico SM decides per task: "Ya lo tenía" (evidence required; approved with the tag "Ya existía", no firm involved, counts for franchisability) or "Hay que hacerla". SM can also mark "Ya lo tenía" on any task not started, flagged by the assessment or not.
- Franchisability = approved tasks over total, with a goal (85 %) and a list of mandatory tasks set by SM Global (may be empty).
- Area health: red if a task is overdue; amber if something is due within 7 days or a deliverable waits for the owner over 7 days; green otherwise; grey if the area does not apply.

## Signing (DocuSeal, simulated)

- The signer draws, types or uploads a signature; "Firmar" needs a signature and shows the consent text. Decline needs a reason.
- Any contract with at least one signature opens as a signed document: the text, one signature block per party (image, name, date, or "Pendiente de firma"), the audit trail (sent, opened, signed, declined with dates) and the document fingerprint. "Descargar PDF" prints only the document.
- Everything goes through the repository (`openContract`, `signContract`, `declineContract`), so the real DocuSeal embed replaces the component without touching the rest.

## Money

The small business pays nothing. The Bishop pays SM the program amount (SM Global rule, today USD 150,000) outside the app; the app records it with date, method, reference and receipt. SM distributes it per business to the firms (one-off, installments or milestones; pending or paid with receipt) and keeps a share. Money is visible only to SM (office and Global) and that Bishop. No payment gateway. Amounts are shown without cents.

## Organizations, roles and accounts

- Tree: SM Global, SM offices by zone (Miami, Orlando, Tampa), businesses, their franchises. Partner firms belong to an office.
- Roles: `sm_global`, `sm_team`, `partner_firm`, `business_owner`, `bishop`, `franchisee`, plus `User.is_admin`.
- SM Global creates anyone anywhere; the office admin creates consultants of the office and partner firms (one active firm per area; "Reemplazar firma" chooses what happens with open tasks); the firm admin invites its people; the owner invites their team and can hand the business over. Nobody is deleted: people are deactivated with a reason and can be reactivated; everything stays in a history. Invitations are simulated.
- Scope: SM team sees everything in its office; the owner only their business; a firm only the tasks assigned to it (or where it collaborates), never the business numbers, manual or documents.
- Route guard: each role reaches only the screens of its menu, plus Mi perfil and the task detail. Typing another role's URL goes back home.
- Verified business data (legal name, address, city, state): the owner edits them only during onboarding. Afterwards they are read-only with the mark "Verificado"; the owner asks for a change with a reason and SM applies or rejects it from the ficha, with a note for the owner. The data layer rejects direct edits (`locked_field`).

## Brand

- Strategic Mates marks are real files in `public/brand` (never the Lovable CDN). Rail footer: "by Strategic Mates".
- Business white label: when the owner approves B5-13 (brand manual), the brand the firm captured (manual PDF, logo image, colors, font) applies to the portal of the owner, the team, the franchisor and its franchises: logo on the rail, primary color on rail and buttons, accent on indicators, AA contrast checked. SM can load it by hand; "Volver a la marca de Strategic Mates" resets it. SM, firms and Bishops keep the SM brand.

## Sample data (so screens are not confused with bugs)

- SM Global: Marilyn Boraei. SM Miami: Andrea Salazar (admin), Nicolás García and Camila Soto (consultants). Offices SM Orlando and SM Tampa.
- Businesses in program: Vossler (Carla Méndez, construction, Orlando, day 74, own brand), Prime 10 Solutions (Daniel Ortiz, remodeling, Tampa), Enyermy Clean Pro (Enyermy Rivas, cleaning, Miami, day 6), Bimbo Remodelaciones (Rodrigo Bimbo, franchisor with franchises Orlando Sur and Tampa).
- Leads: Castillo Instalaciones (Ramón Castillo, in documents, owner in "Tu ingreso"), Morales Pisos y Cerámica, Rivera Roofing & Remodel, Torres Concrete, Pinturas Mamá Lucy (on track: less than a year), Andes Painting (on track), Techos Delgado (accepted, partial funds), Sol Remodeling, Brisa Clean Services, Limpieza Total Orlando (margin "No lo sé"), Soto Drywall (discarded).
- Bishops: Jefferson Paula (framework signed, invested in Vossler and Enyermy), Diego Rivas (framework pending), Laura Ortega.
- Firms of SM Miami: Estudio Pérez (abogados, Lucía Pérez admin), Delta Contadores (finanzas y fiscal), OpsLab Consulting (operaciones), TecnoPyme (tecnología), Agencia XYZ (marketing), SM Miami itself (estrategia, equipo propio).

## Pending (not bugs)

- Backend: a new API (TypeScript, NestJS, PostgreSQL) is being built in a separate repo on top of `src/lib/api` as the contract. Until then everything runs on the mock, and the Lovable preview always stays on the mock. Two folders will arrive from that work and must never be edited in Lovable: `src/shared/domain` (generated copy of the business rules) and `src/lib/api/http` (adapters to the real API).
- Real integrations come last: DocuSeal, Google Calendar, file storage, transactional email.
- Decisions pending with Strategic Mates: MOU text, mandatory documents list, Bishop split (50/22/10 is provisional), zones by state or city, real names of the SM Miami team.
