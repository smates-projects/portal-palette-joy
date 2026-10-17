# Pasada visual (solo presentación)

Sin tocar lógica, datos, textos, rutas, tests ni librerías. Solo layout, responsive y presentación, respetando marca (badges con borde, radio 4 px, light mode).

## Cambios
1. **Móvil (390 px):** rail oculto bajo 768 px; botón hamburguesa en la barra superior abre el mismo menú como panel lateral (Sheet existente). ES/EN y "Ver como" con ancho mínimo legible o dentro del panel.
2. **Tablas en móvil:** filas como tarjetas en pantallas chicas, tabla en escritorio: Oportunidades del Bishop, Personas (SM Global) y pestaña Equipo SM de Catálogo y equipo (nombres sin partir, botones en fila).
3. **Inicio del dueño:** en "Te toca a ti" el botón va debajo, a todo el ancho; "código · nombre" sin truncar.
4. **Embudo a 1440:** degradado en el borde derecho del contenedor con scroll; barra horizontal visible y pegada bajo el tablero (alto acotado al viewport).
5. **Ficha del negocio / Mi negocio, "Cómo va hoy":** grilla que entra en el panel (2 columnas si hace falta); etiqueta de estado envuelve sin cortarse.
6. **Acuerdos del Bishop:** columna de acciones con ancho fijo, botón sin envolver.
7. **Tu ingreso:** ocultar el separador "·" cuando no hay segundo texto.
8. **Personas:** título alineado arriba a la izquierda.
9. **Firma electrónica:** pestañas Dibujar/Escribir/Subir más claras, lienzo a todo el ancho en celular con soporte táctil (touch-action none), campo de firma en el documento con aspecto formal.
10. **Documento firmado:** "papel" con márgenes, tipografía y bloques de firma alineados (1 columna en celular); estilos de impresión que ocultan el resto de la app al "Descargar PDF".
11. **Mi negocio con datos verificados:** filas que envuelven bien en celular; revisar diálogo "Pedir un cambio" y lista "Pedidos de cambio".
12. **Pedidos de cambio de datos (ficha SM):** fila viejo→nuevo, nota y botones alineados con el resto.

## Al terminar
- Capturas: embudo 1440, inicio del dueño 390, oportunidades Bishop 390, ficha de Vossler, diálogo de firma, documento firmado.
- Lista aparte de errores de lógica/datos detectados, sin corregirlos.
- Si un cambio no compila, se revierte ese cambio puntual (sin bucles).

## Técnico
Archivos: AppShell.tsx, nav.ts (solo lectura), OpportunitiesPage, PeoplePage, CatalogTeamPage, OwnerHomePage, pipeline board (LeadViews/PipelinePage), BusinessFile, OwnerBusinessPage, AgreementsPage, IntakeHomePage, SignaturePad, DocuSealSigner, SignedContractDialog, styles.css (solo `@media print` y utilidades de sombra de scroll). Breakpoint `md` (768 px) para tarjeta vs. tabla.
