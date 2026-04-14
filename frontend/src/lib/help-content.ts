/**
 * Contenido de ayuda contextual y glosario para cada modulo.
 * Cada entrada tiene un titulo, descripcion, y una lista de definiciones.
 */

export interface HelpEntry {
  term: string;
  definition: string;
}

export interface ModuleHelp {
  title: string;
  description: string;
  entries: HelpEntry[];
}

export const CATEGORIAS_HELP: HelpEntry[] = [
  { term: "SQ", definition: "Soluciones Quirurgicas — insumos y dispositivos para procedimientos quirurgicos (ej: suturas, instrumental)." },
  { term: "MAH", definition: "Materiales de Alta Hospitalaria — insumos de uso hospitalario general (ej: guantes, jeringas, apositos)." },
  { term: "EQM", definition: "Equipamiento Medico — equipos, maquinaria y servicios asociados (incluye lo que antes era categoria Servicios)." },
  { term: "EVA", definition: "Evaluacion y Diagnostico — productos de diagnostico, imagenologia y evaluacion clinica." },
];

export const HELP: Record<string, ModuleHelp> = {
  dashboard: {
    title: "Panel Principal",
    description: "Vista ejecutiva con los KPIs globales de la empresa. Compara presupuesto 2026 vs venta real acumulada y muestra la evolucion mensual.",
    entries: [
      { term: "Meta (PPTO)", definition: "Presupuesto de venta anual 2026 definido por la empresa, distribuido por zona, KAM, cliente y producto." },
      { term: "Venta YTD", definition: "Venta neta acumulada desde enero hasta el mes actual. Incluye facturas + guias de despacho pendientes." },
      { term: "Cumplimiento", definition: "Porcentaje de avance: Venta / Meta x 100. Verde >=100%, amarillo >=80%, rojo <80%." },
      { term: "Gap", definition: "Diferencia entre venta real y meta. Negativo = falta vender. Positivo = supera la meta." },
      { term: "Crec. vs 2025", definition: "Crecimiento porcentual de la venta 2026 vs el mismo periodo de 2025. La venta 2025 se trae por cliente y periodo (sin filtrar por categoria, ya que la categorizacion cambio entre anos)." },
      ...CATEGORIAS_HELP,
      { term: "Margen % (Margen Bruto)", definition: "Margen bruto de producto: (Venta - Costo) / Venta x 100. El costo corresponde al costo directo del producto, sin incluir costos logisticos, comisiones u otros gastos variables. Semaforo: <30% rojo, 30-40% amarillo, >=40% verde." },
    ],
  },
  televentas: {
    title: "Televentas",
    description: "Seguimiento del canal 16-TELEVENTAS. Muestra venta historica, plan del mes actual con ritmo diario y proyeccion, y avance semanal.",
    entries: [
      { term: "Canal 16-TELEVENTAS", definition: "Equipo de venta telefonica. Filtra BI_TOTAL_FACTURA por VENDEDOR='16-TELEVENTAS'." },
      { term: "Ritmo diario", definition: "Venta del mes actual dividida por los dias habiles transcurridos. Se compara con el ritmo necesario para cumplir la meta." },
      { term: "Proyeccion", definition: "Estimacion de la venta al cierre del mes: Venta acumulada + (ritmo actual x dias habiles restantes)." },
      { term: "Dias habiles", definition: "Dias de lunes a viernes en el mes. Se calculan dinamicamente." },
      { term: "Meta mensual", definition: "Meta del mes actual para Televentas, leida desde la tabla Metas_KAM." },
    ],
  },
  zona: {
    title: "Analisis por KAM",
    description: "Desempeno de cada zona/KAM contra su meta 2026. Incluye desglose por categoria, comparacion con 2025, y detalle de clientes con drill-down.",
    entries: [
      { term: "KAM", definition: "Key Account Manager — ejecutivo comercial responsable de una zona geografica." },
      { term: "Zona", definition: "Division geografica de ventas (ej: STGO 1, ZONA SUR, V REGION). V REGION y V REGION II se unifican." },
      { term: "Mix de Categorias", definition: "Peso porcentual de cada categoria (SQ, MAH, EQM, EVA) en la venta total de la zona. Se compara con el mix del presupuesto para detectar desalineaciones." },
      { term: "Delta (mix)", definition: "Diferencia entre el peso real y el presupuestado de cada categoria. Verde = vende mas de lo presupuestado. Rojo = vende menos." },
      { term: "Margen Meta", definition: "Margen bruto % objetivo definido en Meta_Categoria. Se usa como referencia para evaluar si el margen bruto real esta en linea con lo presupuestado." },
      { term: "Top 25 Clientes", definition: "Los 25 clientes con mayor gap (diferencia venta - meta) en la zona seleccionada." },
    ],
  },
  clientes: {
    title: "Clientes",
    description: "Analisis de clientes en riesgo: caida de ventas 2026 vs 2025, segmentacion y alertas.",
    entries: [
      { term: "Cliente en Caida", definition: "Cliente cuya venta 2026 YTD es menor que su venta 2025 en el mismo periodo." },
      { term: "Caida %", definition: "Porcentaje de disminucion: (Venta 2026 / Venta 2025 - 1) x 100." },
      { term: "Gap de Caida", definition: "Monto que se deja de vender: Venta 2026 - Venta 2025 (valor negativo)." },
    ],
  },
  categoria: {
    title: "MultiProducto",
    description: "Analisis del cliente MULTIPRODUCTO — un cliente especial con precios diferenciados. Muestra tendencia mensual, avance semanal y desglose por categoria.",
    entries: [
      { term: "Cliente MultiProducto", definition: "Cliente mayorista con acuerdo de precios especiales. Se filtra por NOMBRE LIKE '%MULTIPRODUCTO%' en BI_TOTAL_FACTURA." },
      { term: "Avance Semanal", definition: "Comparacion semana a semana del mes actual vs el mes anterior para medir el ritmo de compras." },
      { term: "Tendencia Mensual", definition: "Venta mes a mes 2025 vs 2026 para identificar patrones de estacionalidad." },
    ],
  },
  mercado: {
    title: "Analisis de Mercado",
    description: "Inteligencia competitiva basada en licitaciones publicas y Convenio Marco. Mide el desempeno de LBF en el mercado publico chileno.",
    entries: [
      { term: "Licitacion", definition: "Proceso de compra publica donde instituciones (hospitales, servicios de salud) solicitan ofertas de proveedores. LBF participa y puede ganar o perder." },
      { term: "Win Rate", definition: "Tasa de exito: licitaciones ganadas / licitaciones participadas x 100." },
      { term: "Part. Mercado", definition: "Participacion de mercado: monto ganado por LBF / monto total adjudicado x 100." },
      { term: "Cobertura", definition: "Porcentaje de instituciones donde LBF tiene presencia sobre el total de instituciones del mercado." },
      { term: "Convenio Marco (CM)", definition: "Canal de compra publica donde las instituciones pueden comprar directamente a proveedores habilitados sin licitacion. Se gestiona a traves de ChileCompra." },
      { term: "Market Share CM", definition: "Participacion de LBF en Convenio Marco: monto vendido por LBF / monto total del mercado CM x 100." },
      { term: "Fuga por CM", definition: "Instituciones donde LBF tiene una licitacion ganada, pero la institucion compra a competidores por Convenio Marco. Representa oportunidad de venta perdida." },
      { term: "OC", definition: "Orden de Compra — documento formal emitido por la institucion para adquirir productos." },
    ],
  },
  facturacion: {
    title: "Adj. vs Facturado",
    description: "Compara el monto adjudicado en licitaciones con lo efectivamente facturado. Detecta licitaciones con baja ejecucion o sub-facturacion.",
    entries: [
      { term: "Monto Adjudicado", definition: "Valor total de los productos ganados en una licitacion segun el acta de adjudicacion." },
      { term: "Monto Facturado", definition: "Valor total efectivamente facturado a la institucion por los productos de esa licitacion." },
      { term: "% Ejecucion", definition: "Facturado / Adjudicado x 100. Mide cuanto de lo ganado se ha convertido en venta real." },
      { term: "Dias restantes", definition: "Dias hasta el vencimiento de la licitacion. Si es negativo, la licitacion ya vencio." },
    ],
  },
};

/** All terms flattened for the glossary page */
export function getAllTerms(): { module: string; moduleTitle: string; term: string; definition: string }[] {
  const all: { module: string; moduleTitle: string; term: string; definition: string }[] = [];
  const seen = new Set<string>();
  for (const [mod, help] of Object.entries(HELP)) {
    for (const entry of help.entries) {
      if (!seen.has(entry.term)) {
        seen.add(entry.term);
        all.push({ module: mod, moduleTitle: help.title, term: entry.term, definition: entry.definition });
      }
    }
  }
  return all;
}
