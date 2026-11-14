/**
 * EcoNexus CRM — Daily Summary (GitHub Action)
 * Corre 1×/día a las 7 AM Venezuela (11:00 UTC).
 *
 * Responsabilidades:
 *   1. Ejecutar el matching engine para todas las solicitudes activas.
 *   2. Persistir coincidencias nuevas en crm_resultados_solicitud.
 *   3. Generar crm_resumen_diario por cada agente aprobado.
 *   4. Ejecutar limpieza de solicitudes (15d sin match / 30d total).
 *
 * Requiere:
 *   - Variables de entorno: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   - js/matching-engine.mjs (en la raíz del repo)
 */

import {
  encontrarMatchesParaSolicitud,
} from '../js/matching-engine.mjs';

// ============================================================
// CONFIGURACIÓN
// ============================================================

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Faltan variables de entorno: SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const HEADERS = {
  'apikey': SUPABASE_SERVICE_ROLE_KEY,
  'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};

const MIN_PORCENTAJE_MATCH = 50;
const MAX_MATCHES_POR_SOLICITUD = 50;

// ============================================================
// HELPERS SUPABASE (REST + RPC)
// ============================================================

async function sbGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: HEADERS });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GET ${path} → ${res.status}: ${txt}`);
  }
  return res.json();
}

async function sbUpsert(path, body, onConflict) {
  const url = onConflict
    ? `${SUPABASE_URL}/rest/v1/${path}?on_conflict=${onConflict}`
    : `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...HEADERS,
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`UPSERT ${path} → ${res.status}: ${txt}`);
  }
}

async function sbRpc(fnName, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`RPC ${fnName} → ${res.status}: ${txt}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ============================================================
// CARGA DE DATOS
// ============================================================

async function cargarInventario() {
  console.log('📦 Cargando inventario...');
  const inventario = await sbGet(
    'v_propiedades_catalogo?select=id,codigo_eco,titulo,tipo,operacion,precio,ubicacion,' +
    'habitaciones,banos,estacionamientos,metros,descripcion,fotos,user_id,' +
    'nombre_asesor,telefono_asesor,tipo_asesor,nombre_agencia,fecha_publicacion'
  );
  console.log(`   → ${inventario.length} inmuebles disponibles`);
  return inventario;
}

async function cargarSolicitudesActivas() {
  console.log('📋 Cargando solicitudes activas...');
  const ahora = new Date().toISOString();
  const solicitudes = await sbGet(
    `crm_solicitudes_radar?select=*&activa=eq.true&fecha_expiracion=gt.${encodeURIComponent(ahora)}`
  );
  console.log(`   → ${solicitudes.length} solicitudes vigentes`);
  return solicitudes;
}

async function cargarAgentesAprobados() {
  console.log('👤 Cargando agentes aprobados...');
  const agentes = await sbGet(
    'perfiles?select=id,nombre_agente,email&estatus_agente=eq.Aprobado&notificaciones_activas=eq.true'
  );
  console.log(`   → ${agentes.length} agentes activos`);
  return agentes;
}

async function cargarResultadosExistentes() {
  console.log('🔍 Cargando coincidencias ya calculadas...');
  const existentes = await sbGet(
    'crm_resultados_solicitud?select=solicitud_id,propiedad_id'
  );
  const set = new Set(existentes.map(r => `${r.solicitud_id}::${r.propiedad_id}`));
  console.log(`   → ${existentes.length} coincidencias previas`);
  return set;
}

// ============================================================
// CÁLCULO DE MATCHES
// ============================================================

async function procesarMatches(inventario, solicitudes) {
  console.log('\n🧠 Ejecutando matching engine...');
  const existentes = await cargarResultadosExistentes();

  let nuevosInsertados = 0;
  let solicitudesConMatch = 0;
  let solicitudesSinMatch = 0;

  for (const sol of solicitudes) {
    const matches = encontrarMatchesParaSolicitud(sol, inventario, {
      minPorcentaje: MIN_PORCENTAJE_MATCH,
      maxResultados: MAX_MATCHES_POR_SOLICITUD,
    });

    if (matches.length === 0) {
      solicitudesSinMatch++;
      continue;
    }

    solicitudesConMatch++;

    // Filtrar solo los que NO existan ya
    const nuevos = matches.filter(m => !existentes.has(`${sol.id}::${m.id}`));

    if (nuevos.length === 0) continue;

    const registros = nuevos.map(m => ({
      solicitud_id: sol.id,
      agente_id: sol.agente_id,
      propiedad_id: m.id,
      porcentaje_coincidencia: m._analisis.porcentaje,
      coincide_en: m._analisis.coincidencias,
      no_coincide_en: m._analisis.noCoincidencias,
      visto_por_agente: false,
    }));

    await sbUpsert(
      'crm_resultados_solicitud',
      registros,
      'solicitud_id,propiedad_id'
    );

    nuevosInsertados += nuevos.length;
    console.log(
      `   ✓ Solicitud ${sol.id.substring(0, 8)}… → +${nuevos.length} coincidencia(s)`
    );
  }

  console.log(
    `\n📊 Matches: ${nuevosInsertados} nuevos · ` +
    `${solicitudesConMatch} solicitudes con match · ` +
    `${solicitudesSinMatch} sin match`
  );
}

// ============================================================
// GENERACIÓN DE RESÚMENES DIARIOS
// ============================================================

async function contarInmueblesNuevos24h() {
  const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const nuevos = await sbGet(
    `v_propiedades_catalogo?select=ubicacion&fecha_publicacion=gte.${encodeURIComponent(hace24h)}`
  );
  const zonas = [...new Set(
    nuevos.map(n => n.ubicacion).filter(z => z && z.trim())
  )].slice(0, 5);
  return { count: nuevos.length, zonas };
}

async function contarCoincidenciasNuevasHoy(agenteId) {
  const hoyInicio = new Date();
  hoyInicio.setHours(0, 0, 0, 0);
  const coincidencias = await sbGet(
    `crm_resultados_solicitud?select=id&agente_id=eq.${agenteId}` +
    `&visto_por_agente=eq.false` +
    `&fecha_creacion=gte.${encodeURIComponent(hoyInicio.toISOString())}`
  );
  return coincidencias.length;
}

async function contarSolicitudesActivas(agenteId) {
  const ahora = new Date().toISOString();
  const sol = await sbGet(
    `crm_solicitudes_radar?select=id&agente_id=eq.${agenteId}` +
    `&activa=eq.true&fecha_expiracion=gt.${encodeURIComponent(ahora)}`
  );
  return sol.length;
}

function construirMensaje({ coincidenciasNuevas, inmueblesNuevos, zonas, solicitudesActivas }) {
  let titulo;
  let cuerpo;

  if (coincidenciasNuevas > 0) {
    titulo = 'Nuevas oportunidades para tus clientes';
    cuerpo = `¡${coincidenciasNuevas} nueva(s) coincidencia(s) detectada(s)! ` +
             `Revisa los inmuebles que se ajustan a las solicitudes que dejaste en seguimiento.`;
  } else if (inmueblesNuevos > 0) {
    titulo = 'Nuevos inmuebles en el mercado';
    const zonasTexto = zonas.length > 0
      ? ` Zonas destacadas: ${zonas.join(', ')}.`
      : '';
    cuerpo = `Se cargaron ${inmueblesNuevos} inmuebles nuevos.${zonasTexto} ` +
             `Revisa si alguno encaja con tus solicitudes activas.`;
  } else {
    titulo = 'Actualizaciones del mercado inmobiliario';
    cuerpo = 'Entra para conocer los cambios más recientes en las propiedades publicadas. ' +
             'Nuevas oportunidades pueden estar disponibles para tus clientes.';
  }

  if (solicitudesActivas > 0) {
    cuerpo += ` Tienes ${solicitudesActivas} solicitud(es) en espera. ` +
              `Verifica si hay nuevas coincidencias.`;
  } else {
    cuerpo += ' Consigna una nueva solicitud para monitorear el inventario automáticamente.';
  }

  return { titulo, cuerpo };
}

async function generarResumenes(agentes) {
  console.log('\n📰 Generando resúmenes diarios...');
  const { count: inmueblesNuevos, zonas } = await contarInmueblesNuevos24h();
  const fechaHoy = new Date().toISOString().split('T')[0];

  let generados = 0;

  for (const agente of agentes) {
    const coincidenciasNuevas = await contarCoincidenciasNuevasHoy(agente.id);
    const solicitudesActivas = await contarSolicitudesActivas(agente.id);

    const { titulo, cuerpo } = construirMensaje({
      coincidenciasNuevas,
      inmueblesNuevos,
      zonas,
      solicitudesActivas,
    });

    await sbUpsert(
      'crm_resumen_diario',
      [{
        agente_id: agente.id,
        fecha: fechaHoy,
        nuevos_inmuebles_count: inmueblesNuevos,
        zonas_con_nuevos: zonas,
        solicitudes_activas: solicitudesActivas,
        coincidencias_nuevas: coincidenciasNuevas,
        mensaje_titulo: titulo,
        mensaje_cuerpo: cuerpo,
        leido: false,
      }],
      'agente_id,fecha'
    );

    generados++;
  }

  console.log(`   → ${generados} resumen(es) generado(s) para el día ${fechaHoy}`);
}

// ============================================================
// LIMPIEZA
// ============================================================

async function ejecutarLimpieza() {
  console.log('\n🧹 Ejecutando limpieza de solicitudes...');
  try {
    const resultado = await sbRpc('limpiar_solicitudes_sin_match', {});
    console.log('   →', resultado);
  } catch (e) {
    console.warn('   ⚠ Limpieza falló (no crítico):', e.message);
  }
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  const inicio = Date.now();
  console.log('═══════════════════════════════════════════════════');
  console.log('  EcoNexus Daily Summary — ' + new Date().toISOString());
  console.log('═══════════════════════════════════════════════════\n');

  try {
    const [inventario, solicitudes, agentes] = await Promise.all([
      cargarInventario(),
      cargarSolicitudesActivas(),
      cargarAgentesAprobados(),
    ]);

    await procesarMatches(inventario, solicitudes);
    await generarResumenes(agentes);
    await ejecutarLimpieza();

    const duracion = ((Date.now() - inicio) / 1000).toFixed(1);
    console.log(`\n✅ Completado en ${duracion}s\n`);
  } catch (err) {
    console.error('\n❌ Error fatal:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
