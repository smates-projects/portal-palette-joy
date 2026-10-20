// Texts of the entry contracts in the mock: the plain-words window above the signer (explainer) and the full text
// the document dialog shows (body). The real API sends its own; these follow the same shape so the screens read both.
import type { ContractExplainer } from "../types";

/** Strategic Mates' NDA: already signed by Strategic Mates, the owner signs. */
export const NDA_EXPLAINER: ContractExplainer = {
  title: "Qué es el NDA",
  paragraphs: [
    "Es un acuerdo de confidencialidad. Strategic Mates se compromete a cuidar todo lo que nos cuentes de tu negocio.",
    "Lo pedimos antes de la reunión para que puedas hablar con confianza de tus números, tus clientes y tu forma de trabajar.",
  ],
  bullets: [
    "Lo que compartas se usa solo para el programa.",
    "No se lo damos a nadie que no trabaje en tu programa.",
    "No te compromete a entrar al programa ni a pagar nada.",
  ],
};

export const ndaBody = (businessName: string, ownerName: string) => `Acuerdo de confidencialidad mutuo

Entre Strategic Mates y ${businessName}, representado por ${ownerName}.

1. Información protegida
Toda la información que las partes se compartan durante el ingreso y el programa: números, clientes, precios, proveedores, procesos, documentos y la metodología de Strategic Mates.

2. Uso de la información
Cada parte usa la información de la otra solo para evaluar y hacer el programa Método 180. No la comparte con terceros que no trabajen en el programa, y pide lo mismo a sus firmas y colaboradores.

3. Excepciones
No es confidencial la información que ya era pública, la que una parte ya tenía antes, ni la que la ley obliga a entregar.

4. Duración
Mientras dure la relación y dos años después de que termine.

5. Devolución
Cuando una parte lo pida, la otra devuelve o borra la información recibida.

6. Sin otros compromisos
Firmar este acuerdo no obliga a ninguna de las partes a entrar al programa ni a pagar nada.`;

/** The MOU: the four points in plain words come after this window, each one with its own "Entendí". */
export const MOU_EXPLAINER: ContractExplainer = {
  title: "Qué es el MOU",
  paragraphs: [
    "El MOU es un acuerdo de entendimiento. Explica cómo vamos a trabajar juntos durante el programa, antes de firmar el contrato final.",
    "Lo firmas en la reunión con tu consultor, o antes si ya lo leíste. No es un préstamo ni una venta de tu negocio.",
  ],
  bullets: [
    "Un inversor paga el programa: tú no pagas.",
    "Tu negocio sigue siendo tuyo.",
    "El inversor participa en la empresa nueva que vende las franquicias, no en tu negocio.",
    "Si algo no sale como esperamos, no quedas con deudas por el programa.",
  ],
};

export const mouBody = (businessName: string, ownerName: string) => `Memorando de entendimiento (MOU)

Entre Strategic Mates y ${businessName}, representado por ${ownerName}.

1. Objeto
Las partes quieren trabajar juntas en el programa Método 180 para preparar a ${businessName} para franquiciarse. Este memorando explica cómo, antes del contrato final (Operating Agreement).

2. Quién paga el programa
Un inversor (Bishop) presentado por Strategic Mates paga el programa. Con ese dinero, Strategic Mates y sus firmas aliadas trabajan con el negocio en finanzas, procesos, marca, tecnología y temas legales. ${businessName} no paga el programa.

3. El negocio sigue siendo del dueño
${ownerName} no vende ${businessName} ni entrega una parte de él. Sigue siendo el dueño y decide cómo trabaja su negocio.

4. La empresa franquiciadora
Durante el programa se crea una empresa nueva para vender las franquicias del negocio. El inversor y Strategic Mates participan en esa empresa nueva, no en ${businessName}. Los porcentajes se fijan en el Operating Agreement.

5. Trabajo en conjunto y sin deudas
El programa dura 180 días. Si algo no sale como se espera, ${businessName} y ${ownerName} no quedan debiendo dinero por el programa.

6. Documentos de ingreso
Después de la reunión con el consultor, Strategic Mates pide los documentos del negocio. Se suben en el portal cuando el MOU está firmado.

7. Confidencialidad
Todo lo que las partes compartan sigue cubierto por el acuerdo de confidencialidad que ya firmaron.

8. Qué no es este memorando
No obliga a firmar el Operating Agreement. Cualquiera de las partes puede no seguir adelante antes de firmarlo.`;

/** The owner's own NDA: he wrote it in the portal, Strategic Mates signs it. */
export const OWNER_NDA_EXPLAINER: ContractExplainer = {
  title: "Tu acuerdo de confidencialidad",
  paragraphs: [
    "Es el acuerdo que escribió el dueño para proteger la información de su negocio. Strategic Mates lo firma; el dueño puede firmarlo también.",
  ],
  bullets: [
    "No reemplaza al NDA de Strategic Mates: se suman.",
    "El texto es el que escribió el dueño.",
  ],
};
