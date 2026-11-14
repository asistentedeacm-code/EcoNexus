/**
 * EcoNexus Matching Engine v1.0
 * Motor compartido de coincidencias inmobiliarias.
 *
 * Usado por:
 *   - Navegador (crmerp.html) para la rebúsqueda manual 1×/día
 *   - GitHub Action (scripts/crm-daily-summary.mjs) para el cálculo automático diario
 *
 * Dependencias: NINGUNA. Funciona en Node 18+ y navegadores modernos.
 */

// ============================================================
// NORMALIZACIÓN DE TEXTO
// ============================================================

export function normalizarTexto(texto) {
  if (!texto) return '';
  return String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================
// EXTRACCIÓN DE NÚMEROS DESDE TEXTO LIBRE
// Ejemplos: "$45.000" -> 45000, "45k" -> 45000, "3 hab" -> 3
// ============================================================

export function extraerNumeroDeTextoLibre(texto, esPrecio = false) {
  if (!texto) return 0;
  let str = normalizarTexto(texto);
  if (!str || str === 'todos' || str === 'cualquiera' || str === 'sin limite') return 0;

  const tieneMilK = /\d+\s*k\b/i.test(str);

  if (esPrecio) {
    str = str.replace(/\.(?=\d{3}\b)/g, '').replace(/,(?=\d{3}\b)/g, '');
  }

  const match = str.match(/(\d+(\.\d+)?)/);
  if (!match) return 0;

  let num = parseFloat(match[1]) || 0;
  if (esPrecio && tieneMilK && num < 1000) num *= 1000;
  return num;
}

// ============================================================
// EXTRACCIÓN DE ATRIBUTOS DESDE LA DESCRIPCIÓN
// Detecta "3 habitaciones", "2 baños" dentro del texto de la ficha
// ============================================================

export function extraerAtributoDesdeDescripcion(descripcionNorm, tipoAtributo) {
  if (!descripcionNorm) return 0;
  if (tipoAtributo === 'habitaciones') {
    const m = descripcionNorm.match(
      /\b(\d{1,2})\s*(hab|habitacion|habitaciones|dormitorio|dormitorios|cuarto|cuartos|recamara|recamaras)\b/
    );
    return m ? parseInt(m[1], 10) : 0;
  }
  if (tipoAtributo === 'banos') {
    const m = descripcionNorm.match(/\b(\d{1,2})\s*(bano|banos|sanitario|sanitarios)\b/);
    return m ? parseInt(m[1], 10) : 0;
  }
  return 0;
}

// ============================================================
// DICCIONARIO DE SINÓNIMOS INMOBILIARIOS
// Permite que "planta eléctrica" también coincida con "generador"
// y detecta términos alternativos comunes en Venezuela
// ============================================================

export const DICCIONARIO_SINONIMOS_FICHA = [
  {
    clave: ['planta electrica', 'planta', 'generador'],
    terminos: [
      'planta electrica', 'planta 100%', 'planta total', 'planta para areas',
      'planta 50%', 'generador electrico', 'con planta'
    ]
  },
  {
    clave: ['pozo', 'pozo de agua', 'agua de pozo', 'agua constante'],
    terminos: [
      'pozo', 'pozo profundo', 'agua de pozo', 'pozo propio', 'pozo de agua',
      'agua constante', 'agua 24', 'manantial'
    ]
  },
  {
    clave: ['piso bajo', 'primer piso', 'planta baja', 'pb'],
    terminos: [
      'piso bajo', 'piso 1', 'piso 2', 'piso 3', 'primer piso',
      'segundo piso', 'tercer piso', 'planta baja', 'nivel pb'
    ]
  },
  {
    clave: ['piso medio'],
    terminos: ['piso medio', 'piso 4', 'piso 5', 'piso 6', 'piso 7']
  },
  {
    clave: ['piso alto', 'penthouse', 'ph'],
    terminos: ['piso alto', 'penthouse', 'pent house', 'ultimo piso', 'vista panoramica']
  },
  {
    clave: ['financiamiento', 'credito', 'plazo', 'inicial'],
    terminos: [
      'financiamiento', 'acepta credito', 'con inicial', 'reserva',
      'cuotas', 'pagos fraccionados'
    ]
  },
  {
    clave: ['amoblado', 'equipado', 'linea blanca'],
    terminos: [
      'amoblado', 'totalmente equipado', 'semiamoblado', 'semi amoblado',
      'linea blanca', 'queda con todo'
    ]
  },
  {
    clave: ['obra blanca', 'obra gris', 'remodelado', 'actualizar', 'original'],
    terminos: [
      'obra blanca', 'obra gris', 'remodelado', 'moderno',
      'actualizado', 'para remodelar', 'original'
    ]
  },
  {
    clave: ['terraza', 'balcon', 'patio'],
    terminos: ['terraza', 'balcon', 'patio', 'jardin']
  },
  {
    clave: ['maletero', 'deposito'],
    terminos: ['maletero', 'deposito', 'cuarto de desahogo']
  },
  {
    clave: ['piscina', 'parrillera', 'areas sociales', 'caney'],
    terminos: ['piscina', 'parrillera', 'caney', 'area social', 'areas sociales', 'salon de fiesta']
  },
  {
    clave: ['vigilancia', 'seguridad'],
    terminos: ['vigilancia', 'seguridad 24', 'garita', 'conjunto cerrado', 'calle cerrada']
  }
];

// ============================================================
// VERIFICACIÓN DE BONDAD CON DETECCIÓN DE NEGACIÓN
// Detecta "sin planta", "no tiene pozo" y evita falsos positivos
// ============================================================

export function verificarBondadEnFichaTecnica(reqNormalizado, textoFichaCompletaNorm) {
  if (!reqNormalizado) return true;

  const palabrasReq = reqNormalizado.split(/\s+/).filter(w => w.length > 2);
  const palabraPrincipal = palabrasReq[0] || reqNormalizado;

  const regexNegacion = new RegExp(
    `\\b(sin|no tiene|no posee|no cuenta con)\\s+([a-z0-9]+\\s+)?${palabraPrincipal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
    'i'
  );

  if (regexNegacion.test(textoFichaCompletaNorm)) return false;

  for (const grupo of DICCIONARIO_SINONIMOS_FICHA) {
    const coincideConGrupo = grupo.clave.some(c => reqNormalizado.includes(c) || c.includes(reqNormalizado));
    if (coincideConGrupo) {
      return grupo.terminos.some(termino => textoFichaCompletaNorm.includes(termino));
    }
  }

  if (textoFichaCompletaNorm.includes(reqNormalizado)) return true;

  const palabrasSignificativas = reqNormalizado
    .split(/\s+/)
    .filter(p => p.length > 2 && !['con', 'que', 'por', 'para', 'una', 'uno', 'los', 'las', 'del'].includes(p));

  if (palabrasSignificativas.length === 0) return true;
  return palabrasSignificativas.every(p => textoFichaCompletaNorm.includes(p));
}

// ============================================================
// ANÁLISIS PROFUNDO DE UN INMUEBLE VS CRITERIOS
// Devuelve { porcentaje, coincidencias[], noCoincidencias[] }
// ============================================================

export function analizarCoincidenciaProfundaInmueble(inmueble, criterios) {
  const coincidencias = [];
  const noCoincidencias = [];
  let puntosObtenidos = 0;
  let puntosTotales = 0;

  const opItemNorm = normalizarTexto(inmueble.operacion || '');
  const tipoItemNorm = normalizarTexto(inmueble.tipo || '');
  const ubiItemNorm = normalizarTexto(inmueble.ubicacion || '');
  const tituloNorm = normalizarTexto(inmueble.titulo || '');
  const descNorm = normalizarTexto(inmueble.descripcion || '');
  const codigoNorm = normalizarTexto(inmueble.codigo_eco || '');
  const fichaCompletaNorm = `${tituloNorm} ${ubiItemNorm} ${tipoItemNorm} ${opItemNorm} ${descNorm} ${codigoNorm}`;

  const precioItem = parseFloat(inmueble.precio) || 0;
  const habCasilla = parseInt(inmueble.habitaciones, 10) || 0;
  const banosCasilla = parseInt(inmueble.banos, 10) || 0;
  const habEnDesc = extraerAtributoDesdeDescripcion(descNorm, 'habitaciones');
  const banosEnDesc = extraerAtributoDesdeDescripcion(descNorm, 'banos');
  const habEfectivas = habCasilla > 0 ? habCasilla : habEnDesc;
  const banosEfectivos = banosCasilla > 0 ? banosCasilla : banosEnDesc;

  // 1. Operación (peso 15)
  if (criterios.operacionNorm && criterios.operacionNorm !== 'todos' && criterios.operacionNorm !== 'cualquiera') {
    puntosTotales += 15;
    const buscaVenta = criterios.operacionNorm.includes('venta') || criterios.operacionNorm.includes('compra');
    const buscaAlquiler =
      criterios.operacionNorm.includes('alquiler') ||
      criterios.operacionNorm.includes('arrendamiento') ||
      criterios.operacionNorm.includes('renta');
    if (
      (buscaVenta && (opItemNorm.includes('venta') || fichaCompletaNorm.includes('en venta'))) ||
      (buscaAlquiler && (opItemNorm.includes('alquiler') || fichaCompletaNorm.includes('alquiler'))) ||
      opItemNorm.includes(criterios.operacionNorm)
    ) {
      puntosObtenidos += 15;
      coincidencias.push(`Operación: ${inmueble.operacion || criterios.operacionRaw}`);
    } else {
      noCoincidencias.push(
        `Operación: está en ${inmueble.operacion || 'otra modalidad'} (buscas ${criterios.operacionRaw})`
      );
    }
  }

  // 2. Tipo (peso 20)
  if (
    criterios.tipoNorm &&
    criterios.tipoNorm !== 'todos' &&
    criterios.tipoNorm !== 'todos los tipos' &&
    criterios.tipoNorm !== 'cualquiera'
  ) {
    puntosTotales += 20;
    const tiposBuscados = criterios.tipoNorm.split(/[,;/]+|\s+o\s+/).map(t => t.trim()).filter(Boolean);
    let matchTipo = false;
    for (const tBuscado of tiposBuscados) {
      if (
        tipoItemNorm.includes(tBuscado) ||
        fichaCompletaNorm.includes(tBuscado) ||
        (tBuscado.includes('apto') && (tipoItemNorm.includes('apartamento') || fichaCompletaNorm.includes('apartamento'))) ||
        (tBuscado.includes('apartamento') && (tipoItemNorm.includes('apto') || fichaCompletaNorm.includes('apto'))) ||
        (tBuscado.includes('th') && (tipoItemNorm.includes('townhouse') || fichaCompletaNorm.includes('townhouse'))) ||
        (tBuscado.includes('casa') && (tipoItemNorm.includes('quinta') || fichaCompletaNorm.includes('quinta')))
      ) {
        matchTipo = true;
        break;
      }
    }
    if (matchTipo) {
      puntosObtenidos += 20;
      coincidencias.push(`Tipo: ${inmueble.tipo || criterios.tipoRaw}`);
    } else {
      noCoincidencias.push(`Tipo: es ${inmueble.tipo || 'Otro'} (buscas ${criterios.tipoRaw})`);
    }
  }

  // 3. Ubicación (peso 25)
  if (criterios.ubicacionNorm) {
    puntosTotales += 25;
    const zonasBuscadas = criterios.ubicacionNorm.split(/[,;/]+|\s+o\s+/).map(z => z.trim()).filter(Boolean);
    const zonasCoincidentes = zonasBuscadas.filter(z => fichaCompletaNorm.includes(z));
    if (zonasCoincidentes.length > 0) {
      puntosObtenidos += 25;
      coincidencias.push(`Zona/Ubicación: ${inmueble.ubicacion || zonasCoincidentes.join(', ')}`);
    } else {
      const palabrasZona = criterios.ubicacionNorm.split(/\s+/).filter(w => w.length > 2);
      const palabrasEncontradas = palabrasZona.filter(w => fichaCompletaNorm.includes(w));
      if (palabrasEncontradas.length > 0) {
        puntosObtenidos += 15;
        coincidencias.push(
          `Ubicación parcial: menciona "${palabrasEncontradas.join(' ')}" (${inmueble.ubicacion})`
        );
      } else {
        noCoincidencias.push(
          `Zona: ubicado en ${inmueble.ubicacion || 'otra zona'} (no menciona "${criterios.ubicacionRaw}")`
        );
      }
    }
  }

  // 4. Presupuesto (peso 15)
  if (criterios.precioMaxNum > 0) {
    puntosTotales += 15;
    const precioFmt = '$' + Number(precioItem).toLocaleString('en-US');
    const maxFmt = '$' + Number(criterios.precioMaxNum).toLocaleString('en-US');
    if (precioItem > 0 && precioItem <= criterios.precioMaxNum) {
      puntosObtenidos += 15;
      coincidencias.push(`Presupuesto: ${precioFmt} (dentro del tope de ${maxFmt})`);
    } else if (precioItem > 0 && precioItem <= criterios.precioMaxNum * 1.08) {
      puntosObtenidos += 10;
      coincidencias.push(`Presupuesto cercano: ${precioFmt} (tolerancia negociable sobre ${maxFmt})`);
    } else if (precioItem > 0 && precioItem <= criterios.precioMaxNum * 1.2) {
      puntosObtenidos += 4;
      noCoincidencias.push(`Precio superior: cuesta ${precioFmt} (supera presupuesto de ${maxFmt})`);
    } else {
      noCoincidencias.push(`Precio fuera de rango: cuesta ${precioFmt} (buscas máx ${maxFmt})`);
    }
  }

  // 5. Habitaciones (peso 10)
  if (criterios.habMinNum > 0) {
    puntosTotales += 10;
    const origenHab = habCasilla === 0 && habEnDesc > 0 ? ' (leído en ficha técnica)' : '';
    if (habEfectivas >= criterios.habMinNum) {
      puntosObtenidos += 10;
      coincidencias.push(`Habitaciones: ${habEfectivas} Hab.${origenHab}`);
    } else if (habEfectivas > 0) {
      noCoincidencias.push(
        `Habitaciones: tiene ${habEfectivas} Hab.${origenHab} (buscas ${criterios.habMinNum}+)`
      );
    } else {
      noCoincidencias.push(`Habitaciones: no especifica ${criterios.habMinNum}+ hab en casilla ni descripción`);
    }
  }

  // 6. Baños (peso 5)
  if (criterios.banosMinNum > 0) {
    puntosTotales += 5;
    const origenBanos = banosCasilla === 0 && banosEnDesc > 0 ? ' (leído en ficha técnica)' : '';
    if (banosEfectivos >= criterios.banosMinNum) {
      puntosObtenidos += 5;
      coincidencias.push(`Baños: ${banosEfectivos} Baño(s)${origenBanos}`);
    } else if (banosEfectivos > 0) {
      noCoincidencias.push(
        `Baños: tiene ${banosEfectivos} Baño(s)${origenBanos} (buscas ${criterios.banosMinNum}+)`
      );
    } else {
      noCoincidencias.push(`Baños: no especifica ${criterios.banosMinNum}+ baños en casilla ni descripción`);
    }
  }

  // 7. Bondades (peso 20)
  if (criterios.listaBondades && criterios.listaBondades.length > 0) {
    const pesoPorBondad = 20 / criterios.listaBondades.length;
    criterios.listaBondades.forEach(bondadObj => {
      puntosTotales += pesoPorBondad;
      const loTieneEnFicha = verificarBondadEnFichaTecnica(bondadObj.norm, fichaCompletaNorm);
      if (loTieneEnFicha) {
        puntosObtenidos += pesoPorBondad;
        coincidencias.push(`Ficha Técnica SÍ incluye: "${bondadObj.raw}"`);
      } else {
        noCoincidencias.push(`Ficha Técnica NO menciona: "${bondadObj.raw}"`);
      }
    });
  }

  const porcentaje = puntosTotales > 0 ? Math.round((puntosObtenidos / puntosTotales) * 100) : 100;

  return {
    porcentaje,
    puntosObtenidos,
    puntosTotales,
    coincidencias,
    noCoincidencias,
    habEfectivas,
    banosEfectivos
  };
}

// ============================================================
// CONSTRUIR CRITERIOS DESDE UNA FILA DE crm_solicitudes_radar
// ============================================================

export function criteriosDesdeSolicitud(solicitud) {
  const operacionRaw = solicitud.operacion || '';
  const tipoRaw = solicitud.tipo || '';
  const ubicacionRaw = solicitud.ubicacion_clave || '';
  const precioMaxRaw = String(solicitud.precio_max || '');
  const habRaw = String(solicitud.habitaciones_min || '');
  const banosRaw = String(solicitud.banos_min || '');
  const notasRaw = solicitud.notas_requerimiento || '';

  const listaBondades = notasRaw
    ? notasRaw
        .split(/[,;+]+|\s+y\s+|\s+con\s+/i)
        .map(b => b.trim())
        .filter(b => b.length > 1)
        .map(b => ({ raw: b, norm: normalizarTexto(b) }))
    : [];

  return {
    hayAlgunCriterio: Boolean(
      operacionRaw || tipoRaw || ubicacionRaw || precioMaxRaw || habRaw || banosRaw || notasRaw
    ),
    operacionRaw,
    operacionNorm: normalizarTexto(operacionRaw),
    tipoRaw,
    tipoNorm: normalizarTexto(tipoRaw),
    ubicacionRaw,
    ubicacionNorm: normalizarTexto(ubicacionRaw),
    precioMaxRaw,
    precioMaxNum: Number(solicitud.precio_max) || extraerNumeroDeTextoLibre(precioMaxRaw, true),
    habRaw,
    habMinNum: Number(solicitud.habitaciones_min) || extraerNumeroDeTextoLibre(habRaw, false),
    banosRaw,
    banosMinNum: Number(solicitud.banos_min) || extraerNumeroDeTextoLibre(banosRaw, false),
    notasRaw,
    listaBondades
  };
}

// ============================================================
// CONSTRUIR CRITERIOS DESDE CAMPOS DE FORMULARIO (browser)
// ============================================================

export function criteriosDesdeFormulario(campos) {
  const operacionRaw = (campos.operacion || '').trim();
  const tipoRaw = (campos.tipo || '').trim();
  const ubicacionRaw = (campos.ubicacion || '').trim();
  const precioMaxRaw = (campos.precioMax || '').trim();
  const habRaw = (campos.habitaciones || '').trim();
  const banosRaw = (campos.banos || '').trim();
  const notasRaw = (campos.notas || '').trim();

  const listaBondades = notasRaw
    ? notasRaw
        .split(/[,;+]+|\s+y\s+|\s+con\s+/i)
        .map(b => b.trim())
        .filter(b => b.length > 1)
        .map(b => ({ raw: b, norm: normalizarTexto(b) }))
    : [];

  return {
    hayAlgunCriterio: Boolean(
      operacionRaw || tipoRaw || ubicacionRaw || precioMaxRaw || habRaw || banosRaw || notasRaw
    ),
    operacionRaw,
    operacionNorm: normalizarTexto(operacionRaw),
    tipoRaw,
    tipoNorm: normalizarTexto(tipoRaw),
    ubicacionRaw,
    ubicacionNorm: normalizarTexto(ubicacionRaw),
    precioMaxRaw,
    precioMaxNum: extraerNumeroDeTextoLibre(precioMaxRaw, true),
    habRaw,
    habMinNum: extraerNumeroDeTextoLibre(habRaw, false),
    banosRaw,
    banosMinNum: extraerNumeroDeTextoLibre(banosRaw, false),
    notasRaw,
    listaBondades
  };
}

// ============================================================
// MATCHING GLOBAL
// Devuelve los inmuebles que mejor coinciden con una solicitud
// ordenados por porcentaje descendente
// ============================================================

export function encontrarMatchesParaSolicitud(solicitud, inventario, opciones = {}) {
  const minPorcentaje = opciones.minPorcentaje ?? 50;
  const maxResultados = opciones.maxResultados ?? 50;

  const criterios = criteriosDesdeSolicitud(solicitud);
  if (!criterios.hayAlgunCriterio) return [];

  const evaluados = [];
  for (const inmueble of inventario) {
    const analisis = analizarCoincidenciaProfundaInmueble(inmueble, criterios);
    if (analisis.porcentaje >= minPorcentaje) {
      evaluados.push({ ...inmueble, _analisis: analisis });
    }
  }

  evaluados.sort((a, b) => {
    if (b._analisis.porcentaje !== a._analisis.porcentaje) {
      return b._analisis.porcentaje - a._analisis.porcentaje;
    }
    return (parseFloat(a.precio) || 0) - (parseFloat(b.precio) || 0);
  });

  return evaluados.slice(0, maxResultados);
}

// ============================================================
// EXPORT DEFAULT (para debugging o inspección)
// ============================================================

export default {
  normalizarTexto,
  extraerNumeroDeTextoLibre,
  extraerAtributoDesdeDescripcion,
  verificarBondadEnFichaTecnica,
  analizarCoincidenciaProfundaInmueble,
  criteriosDesdeSolicitud,
  criteriosDesdeFormulario,
  encontrarMatchesParaSolicitud,
  DICCIONARIO_SINONIMOS_FICHA
};
