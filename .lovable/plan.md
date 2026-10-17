# Pasada de consistencia visual (solo presentación)

Sin tocar `src/lib`, `src/locales` ni tests; sin cambiar textos, rutas, lógica ni librerías. Si un cambio no compila, se revierte ese cambio puntual.

## Referencia (pantallas hechas en Lovable)
Mis tareas, detalle de tarea, Inicio del dueño, tablero del Embudo, detalle del lead:
- Contenedor de página `mx-auto max-w-7xl px-6 py-8`; pregunta `text-2xl font-semibold`; secciones `text-sm font-semibold`; subtítulos `text-xs uppercase tracking-wide text-muted-foreground`.
- Tarjetas y tablas `rounded-md border border-border bg-surface`, sin sombras; cabecera de tabla `bg-muted text-xs text-muted-foreground`.
- Badges con borde y radio 4 px (`StatusBadge` / `ToneBadge`).
- Botones: primario institucional, secundario con borde, enlace `text-link`.
- Carga con skeleton, error con "reintentar", vacío con caja punteada.
- Diálogos `sm:max-w-md` (formularios simples) o `sm:max-w-lg`; paneles laterales `sm:max-w-md`.

## Paso 1: lista de diferencias
Antes de tocar nada, recorro cada archivo y entrego en el chat la lista "archivo → patrón que no coincide". Ya detectado en una primera revisión:
- `docuseal/DocuSealSigner.tsx`, `SignaturePad.tsx`, `SignedContractDialog.tsx`: `bg-white` fijo y `shadow-sm` (fuera de tokens y de la regla "sin sombras"); papel con `rounded-sm` en vez de `rounded-md`.
- `brand/BrandPreview.tsx`: `text-white` fijo sobre el color del negocio (se evalúa si es intencional por ser vista previa de la marca del cliente; si lo es, se deja y se anota).
- `funds/FundsPanel.tsx`, `DistributionSection.tsx`: carga como un solo bloque de skeleton y error propio; alinear con skeleton por filas y caja de error común.
- `funds/FundsAndDistribution.tsx`: jerarquía h3/h4 y espaciado a revisar contra las secciones del detalle del lead.
- `global/people/PeoplePage.tsx`, `accounts/*`: filtros, tabla y botones a comparar con Mis tareas.
- `office/CatalogTeamPage.tsx`, `FirmDialogs.tsx`: diálogo de firma `sm:max-w-lg` con scroll; revisar tarjetas de firma y estados vacíos.
- `pipeline/EntrySections.tsx`, `AssessmentResult.tsx`, `SimulateEntry.tsx`, `AddBusinessDialog.tsx`, `ManualLeadSection.tsx`: espaciados y títulos de sección dentro del detalle del lead.
- `business/BusinessFile.tsx`, `owner/business/OwnerBusinessPage.tsx`, `owner/documents/OwnerDocumentsPage.tsx`, `brand/BrandPanel.tsx`, `BrandCaptureSection.tsx`: espaciado entre secciones, títulos, botones y estados.

## Paso 2: aplicar solo lo de presentación
Clases de Tailwind (espaciado, tipografía, radio, bordes, ancho de diálogos, tokens de color en lugar de blanco fijo, quitar sombras), reutilizando los componentes de skeleton/error/vacío ya existentes. Nada de lógica ni datos.

## Al terminar
- Capturas: ficha del negocio, Fondos y distribución, Personas, detalle de un lead en Documentación.
- Lista de lo que cambié y lista aparte de lo que anoté (lógica o datos), sin corregirlo.
