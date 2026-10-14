# SM Platform: base del proyecto (rol Firma aliada)

Pantallas para: **Firma aliada**. Las cuatro pantallas del menú quedan vacías, solo con título y subtítulo-pregunta.

## Qué se va a ver
- **Rail izquierdo azul institucional** (#153f58): arriba solo el isotipo dorado (no hay versión negativa del logo horizontal). Menú: Inicio, Mis tareas, Clientes, Mi perfil. El item activo lleva un indicador dorado. Se puede colapsar a íconos.
- **Barra superior blanca**: título de la pantalla, buscador (visual), campana (sin funcionalidad), selector ES/EN, selector "Ver como" y avatar con iniciales.
- **"Ver como"**: Estudio Pérez Legal (Legal) y Agencia XYZ (Marketing). "Dueño del negocio" y "Equipo SM" deshabilitados con etiqueta "Próximamente". Al cambiar de usuario, los datos se filtran por esa firma.
- **Logo horizontal**: solo sobre fondo blanco (no aparece en el rail). Isotipo como ícono de la pestaña.
- Modo claro y oscuro, todo el texto en ES (por defecto) y EN.

## Datos de prueba (en memoria, persisten durante la sesión)
- Negocios: Vossler (Orlando, día 74, Carla Méndez), Prime 10 Solutions (Tampa, día 31, Daniel Ortiz), Enyermy Hair Studio (Miami, día 6, Enyermy Rivas).
- Equipo SM: Marylin Boraei (directora), Nicolás García (consultor).
- 30 tareas: B6-01 a B6-05 de Estudio Pérez Legal y B5-01 a B5-05 de Agencia XYZ en los tres negocios, con nombres, criterios y dependencias exactamente como los diste.
- Estados según avance: Vossler (día 74) más avanzado, Prime 10 intermedio, Enyermy (día 6) casi todo por empezar. Garantizado: 2+ bloqueadas, 2+ vencidas (respecto de hoy 14/10/2026), 2+ con cambios pedidos, 2+ esperando aprobación.
- Caso principal B6-02 en Vossler: v1 entregada, Carla pide cambios ("falta el acta constitutiva"), pedido al dueño resuelto (Carla sube el acta), v2 entregada esperando aprobación, reunión propuesta. Comentarios con tono humano real.

## Nota sobre el enrutado
El Project Knowledge menciona React Router, pero esta plataforma usa TanStack Router (fijo, no se puede cambiar). Cumple el mismo rol; el resto de la arquitectura (TanStack Query, repositorios mock/http) queda igual.

## Detalles técnicos
- Logos: `lovable-assets` para LogoF.png e Isotype.png → `src/assets/*.asset.json`; `public/favicon.png` desde el isotipo (64x64 con magick), quitar `favicon.ico`. `components/brand/Logo.tsx` (variant `horizontal` | `isotype`).
- Tema en `src/styles.css`: tokens oklch para azules y dorados de marca, `--sidebar*` en azul, colores de estado (gris, azul, violeta, ámbar, rojo, verde) y de área B1–B6; Inter + Archivo vía `<link>` en `__root.tsx`; `tabular-nums`; radio 4px en badges; sin gradientes.
- i18n: `react-i18next`, `src/locales/es.json` / `en.json` por pantalla, idioma guardado en localStorage (leído tras hidratar). Helpers Intl para fechas, fechas relativas y USD.
- `src/config/app.ts`: `TODAY = 2026-10-14`, `API_MODE` desde `VITE_API_MODE` (default mock).
- `src/lib/api/`: `types.ts` (snake_case, ids UUID, fechas ISO: Organization, Business, User, Task, TaskVersion, Comment, OwnerRequest, Meeting, TaskStatus), `repositories.ts` (interfaces TasksRepository, OrganizationsRepository, BusinessesRepository, UsersRepository, SessionRepository), `mock/` (seed + implementación en memoria que filtra por usuario actual), `index.ts` selecciona mock|http, `computed.ts` (is_blocked, is_overdue), `hooks/` TanStack Query.
- Rutas: `index.tsx` (Inicio), `tareas.tsx`, `clientes.tsx`, `perfil.tsx`; layout de app (rail + barra) en `__root.tsx`. `head()` propio por ruta.
- Componentes shadcn necesarios (button, dropdown-menu, input, avatar, tooltip, badge, sonner) y `StatusBadge` listo para usar.
- Tests vitest: transiciones de estado válidas, cálculo de bloqueada/vencida, filtro por firma del mock, y los mínimos del seed (2 bloqueadas, 2 vencidas, etc.).
- Memoria del proyecto: reglas de uso del logo y marca. `AGENTS.md`: regla de capa de datos por repositorios.
