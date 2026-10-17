# Flujo de entrada: del assessment al día 1 (en 3 partes)

Construyo sobre lo que ya existe: Embudo, Documentos del dueño, contratos y las pantallas del Bishop. No toco las pantallas de las firmas ni las de un negocio que ya está en programa. Todo el texto va en es.json y en.json, en español neutro con tú.

## Parte 1: Etapas, documentación y DocuSeal simulado
- Etapas nuevas: Evaluado, Reunión, Documentación, Aceptado, En programa (Descartado al final). Los leads de muestra que estaban en "contract" pasan a Aceptado.
- Una acción principal por etapa: Agendar reunión, Enviar NDA y MOU, Revisar documentos / Aprobar documentación, y las acciones de Aceptado (Esperando inversor, Enviar contrato tripartito, Registrar fondos), y Ver programa.
- Solo se puede mover un paso hacia atrás. Para avanzar a Documentación, Aceptado o En programa hay que usar las acciones. Se puede descartar desde cualquier etapa, con motivo.
- Contadores nuevos: En revisión de documentos, Revisión vencida, Aceptados sin inversor.
- Detalle del lead: checklist con NDA, MOU (estado de cada firmante, Reenviar después de 3 días), documentos subidos y aceptados. Cada documento tiene Aceptar (con el dato verificado) y Pedir otro (con comentario). También "Aprobar documentación" (solo admins, con el motivo cuando está deshabilitado) y "No aprobar".
- Reloj de revisión "día N de 15": arranca cuando el dueño sube todo, se pausa si se pidió otro documento, se pone ámbar desde el día 11 y rojo después del 15. El plazo lo define SM Global en Reglas.
- Reglas de SM Global: "Plazo de revisión de documentos" y "Documentos de ingreso" (los 7 iniciales, con la etiqueta "A validar con Melany"; se pueden agregar, editar, marcar obligatorios y archivar).
- Usuarios: se agrega el campo de administrador. Marilyn (Global) es admin y se suma un admin nuevo de muestra en SM Miami.
- Inicio de SM: "Revisar documentos de {negocio}: día 6 de 15", con link al lead.
- DocuSealSigner: PDF de muestra, Firmar, Rechazar con motivo y Descargar PDF firmado. SM lo usa para contrasignar.
- Dueño en ingreso: "Tu ingreso" ("¿Qué te falta para empezar?") con un solo paso destacado a la vez. El menú muestra solo Inicio y Documentos, y la subida se habilita con el NDA firmado.
- Datos de muestra: un lead en Reunión, uno en Documentación con el reloj pausado (5 de 7 subidos, 3 aceptados, 1 pedido de nuevo) y uno con la revisión vencida (día 17 de 15).

## Parte 2: Bishop y contrato tripartito
- La oportunidad nace del lead, con fases: en revisión, disponible, aceptada por ti, contrato en firma, fondos pendientes. La fase aparece como columna y como filtro.
- Antes de aceptar, el Bishop ve el alias del negocio, lo que declaró el dueño, el resultado del assessment, la lista "Verificado por SM" y el checklist de ingreso. También el recordatorio de no circunvención. Nunca ve el contacto del dueño.
- "Aceptar oportunidad" muestra una confirmación con el monto. Hay "No me interesa" con deshacer. Al aceptar, la oportunidad se oculta para los demás Bishops y SM recibe un aviso.
- Acuerdo marco como primer ítem de Acuerdos. Si no está firmado, el Bishop solo ve "Firma tu acuerdo marco".
- SM ve en el detalle quién vio la oportunidad, quién pasó y quién aceptó, y puede "Liberar oportunidad" con motivo.
- Contrato tripartito con tres firmantes, cada uno firma desde su portal.
- Datos de muestra: un lead aceptado sin Bishop hace 35 días (dos lo vieron y uno pasó) y uno con el tripartito firmado por 2 de 3.

## Parte 3: Fondos y distribución
- "Fondos del Bishop": Pendiente, Parcial o Recibidos. SM registra cada pago con fecha, medio, referencia y comprobante. El Bishop sube su comprobante desde Acuerdos y SM lo confirma. No hay pasarela de pago.
- Arranque: cuando está el tripartito firmado y los fondos completos, SM confirma el día 1 en un cuadro que propone la fecha de lo último que se cumplió y deja elegir una posterior. Ahí se generan las tareas del catálogo. Esto reemplaza "Marcar contrato firmado".
- "Fondos y distribución" en el negocio (vista SM): una línea por firma más Strategic Mates. La suma no puede pasar del total recibido, y se muestra cuánto queda sin asignar. Cada pago está Pendiente o Pagado, y se ve Vencido si pasó la fecha.
- Quién ve los montos: SM los ve todos; el Bishop ve los suyos, solo lectura; el dueño y las firmas no ven ninguno.
- Datos de muestra: un lead con fondos parciales (USD 100.000 de 150.000) y Vossler, Prime 10 y Enyermy con su Bishop y distribución.

## Detalles técnicos
- `LEAD_STAGES`, `resolveLeadMove` y `primaryActionFor` en `src/lib/leads/pipeline.ts`. Nuevo `src/lib/leads/onboarding.ts` con funciones puras: `reviewClock`, `canApproveDocs`, `opportunityPhase` y `readyToStart`.
- `BusinessStatus` suma "onboarding". `DocumentState` suma "rejected", con review_comment y reviewed_at. `User.is_admin`. `BishopOpportunity` suma lead_id y phase.
- `RulesRepository` suma document_review_days, intake_documents y program_amount. Los contratos firman con `signContract`/`declineContract`. Nuevos repositorios de fondos y distribución. El mock quita los montos para el dueño y las firmas.
- Tests de las reglas de movimiento, el reloj, la habilitación de "Aprobar documentación", la fase de la oportunidad, el arranque y que el mock nunca envíe montos al dueño ni a las firmas.
- Actualizo AGENTS.md y la memoria del pipeline.
- Queda para después: WhatsApp, DocuSeal y Google Calendar reales, subida real de archivos, historial de la distribución, totales de Global, alta de Bishops, alertas sin inversor y revalidación a los 6 meses.
