/**
 * ECONEXUS VOICE ASSISTANT v2 — "Eco, tu estratega inmobiliario"
 * 100% determinístico (sin IA). Motor de reglas + Supabase directo.
 * Ubicación: /js/asistente-voz.js
 */
(function () {
  'use strict';

  // ============================================================
  // CONFIG
  // ============================================================
  const CFG = {
    SUPABASE_URL: 'https://gvcklmqldswxfweliuio.supabase.co',
    SUPABASE_KEY: 'sb_publishable_Yu3I-FpcjU44dHsPs9pPDQ_9TEC9fKa',
    WORKER_URL: 'https://econexus-engine.asistentedeacm.workers.dev',
    FRONTEND_ORIGIN: 'https://econexusplatform.com',
    NOMBRE: 'Eco',
    ROL: 'tu estratega inmobiliario de EcoNexus',
    TAMANO_LOTE: 3,
    MAX_RESULTADOS: 500,
    LANG_REC: 'es-VE',
    LANG_TTS: 'es-ES'
  };

  // ============================================================
  // ESTADO
  // ============================================================
  const S = {
    activo: false,
    fase: 'IDLE', // IDLE | ESCUCHANDO | PROCESANDO | SELECCIONANDO | LEYENDO_FICHA | CONFIRMANDO
    filtros: {},
    resultados: [],
    loteActual: 0,
    indiceFichaEnResultados: -1,
    db: null,
    rec: null,
    synth: window.speechSynthesis || null,
    wakeLock: null
  };

  // ============================================================
  // UTILIDADES
  // ============================================================
  function norm(t) {
    if (!t) return '';
    return String(t).toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9ñ\s]/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtPrecio(n) { return '$' + Number(n || 0).toLocaleString('en-US'); }

  function getDb() {
    if (typeof dbClient !== 'undefined' && dbClient) return dbClient;
    if (!S.db && window.supabase && window.supabase.createClient) {
      S.db = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY);
    }
    return S.db;
  }

  // ============================================================
  // NÚMEROS EN ESPAÑOL
  // ============================================================
  const WNUM = {
    cero:0,uno:1,un:1,una:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,siete:7,ocho:8,nueve:9,diez:10,
    once:11,doce:12,trece:13,catorce:14,quince:15,dieciseis:16,diecisiete:17,dieciocho:18,diecinueve:19,
    veinte:20,veintiuno:21,veintidos:22,veintitres:23,veinticuatro:24,veinticinco:25,
    veintiseis:26,veintisiete:27,veintiocho:28,veintinueve:29,
    treinta:30,cuarenta:40,cincuenta:50,sesenta:60,setenta:70,ochenta:80,noventa:90,
    cien:100,ciento:100,doscientos:200,trescientos:300,cuatrocientos:400,
    quinientos:500,seiscientos:600,setecientos:700,ochocientos:800,novecientos:900
  };

  function parseNumeroDesdeTexto(texto) {
    let t = norm(texto);
    // Compuestos de centenas: "ciento cincuenta" → 150
    t = t.replace(/\b(cien|ciento|doscientos|trescientos|cuatrocientos|quinientos|seiscientos|setecientos|ochocientos|novecientos)\s+(veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa)\b/g,
      (m,a,b) => String((WNUM[a]||0)+(WNUM[b]||0)));
    t = t.replace(/\b(cien|ciento|doscientos|trescientos|cuatrocientos|quinientos|seiscientos|setecientos|ochocientos|novecientos)\s+(uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)\b/g,
      (m,a,b) => String((WNUM[a]||0)+(WNUM[b]||0)));
    // Veinti-x / treinta y x
    t = t.replace(/\b(veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa)\s+(y\s+)?(uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)\b/g,
      (m,a,y,b) => String((WNUM[a]||0)+(WNUM[b]||0)));
    // Palabra → dígito (mil/millón aparte)
    t = t.replace(/\b([a-zñ]+)\b/g, (m) => {
      if (m === 'mil') return '1000';
      if (m === 'millon' || m === 'millones') return '1000000';
      if (m === 'medio') return '0.5';
      return WNUM[m] !== undefined ? String(WNUM[m]) : m;
    });
    // Separadores de miles (80.000 / 80,000 → 80000)
    t = t.replace(/(\d)[.,](\d{3})\b/g, '$1$2');
    // "100 1000" → 100000
    t = t.replace(/(\d+)\s+(1000)\b/g, (m,a) => String(parseInt(a)*1000));
    t = t.replace(/(\d+)\s+(1000000)\b/g, (m,a) => String(parseInt(a)*1000000));
    const m = t.match(/(\d+(?:\.\d+)?)/);
    return m ? parseFloat(m[1]) : null;
  }

  // ============================================================
  // NLU — DICCIONARIOS
  // ============================================================
  const TIPOS_MAP = [
    [['apartaestudio','apartamento','apartamentos','apto','aptos','penthouse','pent house','ph'],'apartamento'],
    [['townhouse','townhouses','th'],'townhouse'],
    [['casa','casas','quinta','quintas'],'casa'],
    [['local','locales'],'local'],
    [['oficina','oficinas'],'oficina'],
    [['galpon','galpones'],'galpon'],
    [['terreno','terrenos','parcela','parcelas','lote','lotes'],'terreno'],
    [['edificio','edificios'],'edificio']
  ];

  const OPER_MAP = {
    venta:'Venta', comprar:'Venta', compra:'Venta', vender:'Venta',
    alquiler:'Alquiler', alquilar:'Alquiler', renta:'Alquiler',
    rentar:'Alquiler', arrendar:'Alquiler', arriendo:'Alquiler'
  };

  const BONDADES_KEYS = [
    'planta electrica','planta','generador','pozo','agua constante','pozo de agua',
    'piscina','parrillera','caney','areas sociales','jardin',
    'terraza','balcon','patio','maletero','deposito',
    'vigilancia','seguridad','garita','conjunto cerrado',
    'amoblado','equipado','linea blanca','semiamoblado',
    'obra blanca','obra gris','remodelado',
    'financiamiento','credito','inicial',
    'piso bajo','primer piso','planta baja','piso alto','ultimo piso','vista panoramica'
  ];

  function extraerFiltros(transcript) {
    const t = norm(transcript);
    const out = {};

    // Operación
    for (const [k,v] of Object.entries(OPER_MAP)) {
      if (new RegExp('\\b'+k+'\\b').test(t)) { out.operacion = v; break; }
    }
    // Tipo
    for (const [keys,val] of TIPOS_MAP) {
      for (const k of keys) {
        if (new RegExp('\\b'+k.replace(/\s+/g,'\\s+')+'\\b').test(t)) { out.tipo = val; break; }
      }
      if (out.tipo) break;
    }
    // Código ECO-123456 o "código 123456"
    let mc = t.match(/\beco[\s\-]?(\d{4,8})\b/);
    if (mc) out.codigo = 'ECO-' + mc[1];
    mc = t.match(/\bcodigo\s+(\d{4,8})\b/);
    if (mc && !out.codigo) out.codigo = 'ECO-' + mc[1];

    // Habitaciones
    const mHab = t.match(/(\d+)\s*(habitacion|habitaciones|hab|cuarto|cuartos|dormitorio|dormitorios|recamara|recamaras)/);
    if (mHab) out.habitacionesMin = parseInt(mHab[1]);
    // Baños
    const mBan = t.match(/(\d+)\s*(bano|banos|sanitario|sanitarios)/);
    if (mBan) out.banosMin = parseInt(mBan[1]);
    // Metros
    const mMet = t.match(/(\d+)\s*(metro|metros|m2|mts)/);
    if (mMet) out.metrosMin = parseInt(mMet[1]);
    // Estacionamientos
    const mEst = t.match(/(\d+)\s*(puesto|puestos|estacionamiento|estacionamientos|carro|carros)/);
    if (mEst) out.estacionamientosMin = parseInt(mEst[1]);

    // Precio: "hasta X", "máximo X", "menos de X", "no más de X"
    const mP = t.match(/(hasta|maximo|max|menos de|no mas de|tope|presupuesto de|con)\s+([\d\.\,\s]+(?:mil|millon|millones)?)/);
    if (mP) { const n = parseNumeroDesdeTexto(mP[2]); if (n) out.precioMax = n; }
    // Rango: "entre X y Y"
    const mE = t.match(/entre\s+([\d\.\,]+(?:\s*mil)?)\s*y\s*([\d\.\,]+(?:\s*mil)?)/);
    if (mE) {
      const a = parseNumeroDesdeTexto(mE[1]); const b = parseNumeroDesdeTexto(mE[2]);
      if (a) out.precioMin = a; if (b) out.precioMax = b;
    }
    // "100 mil" suelto → precioMax
    if (!out.precioMax && !out.precioMin) {
      const mSolo = t.match(/(\d{2,3}(?:[\.\,]\d{3})+|\d{3,})\s*(mil|k)?/);
      if (mSolo) { const n = parseNumeroDesdeTexto(mSolo[0]); if (n && n >= 100) out.precioMax = n; }
    }

    // Ubicación: tras "en / zona / sector / por"
    const mU = t.match(/\b(?:en|zona|sector|por|de la zona)\s+([a-zñ\s]{3,40}?)(?=\s+(?:hasta|con|maximo|entre|que|para|y|o|de|por|\d)|$)/);
    if (mU) {
      const tokens = mU[1].trim().split(/\s+/).filter(w => {
        if (!w || w.length < 3) return false;
        if (OPER_MAP[w]) return false;
        for (const [keys] of TIPOS_MAP) { if (keys.includes(w)) return false; }
        if (['con','los','las','una','unos','unas','que','para','por'].includes(w)) return false;
        return true;
      });
      if (tokens.length) out.ubicacion = tokens.join(' ');
    }

    // Bondades
    const bonds = BONDADES_KEYS.filter(b => t.includes(b));
    if (bonds.length) out.bondades = bonds;

    // VIP / destacado
    if (/\b(vip|destacado|destacados|premium|exclusivo|exclusivos)\b/.test(t)) out.vip = true;

    return out;
  }

  // ============================================================
  // INTENCIONES
  // ============================================================
  function detectarIntencion(transcript, fase) {
    const t = norm(transcript);
    // Comandos sueltos que dependen de la fase
    if (/^\s*siguiente\s*$/.test(t)) return fase === 'LEYENDO_FICHA' ? 'LEER_SIGUIENTE' : 'SIGUIENTE_LOTE';
    if (/^\s*(atras|anterior|la anterior|el anterior|previo)\s*$/.test(t)) {
      return fase === 'LEYENDO_FICHA' ? 'LEER_ANTERIOR' : 'ANTERIOR_LOTE';
    }

    if (/\b(para|detente|deten|silencio|stop|cancelar|cancela|basta|quieto)\b/.test(t) && t.split(' ').length <= 3) return 'DETENER';
    if (/\b(repite|repetir|otra vez|de nuevo|como dijiste|que dijiste|no escuche)\b/.test(t)) return 'REPETIR';
    if (/\b(limpiar|limpia|nuevo|nueva busqueda|reiniciar|borrar busqueda|resetear|empezar de nuevo|otra busqueda)\b/.test(t)) return 'LIMPIAR';
    if (/\b(ayuda|ayudame|que puedes hacer|como funciona|como te uso|instrucciones|comandos)\b/.test(t)) return 'AYUDA';
    if (/\b(cuantos|cuantas|cantidad|total de resultados|cuantos hay)\b/.test(t)) return 'CONTAR';
    if (/\b(mas barato|mas economico|menor precio|el barato)\b/.test(t)) return 'ORDEN_BARATO';
    if (/\b(mas caro|mayor precio|el costoso|mas costoso)\b/.test(t)) return 'ORDEN_CARO';
    if (/\b(hola|buenas|buenos dias|buenas tardes|buenas noches|saludos|hey|que tal|ola)\b/.test(t) && t.split(' ').length <= 4) return 'SALUDO';

    if (fase === 'SELECCIONANDO' || fase === 'LEYENDO_FICHA') {
      if (/\b(siguiente lote|siguiente grupo|mas opciones|otras opciones|ver mas|mostrar mas|hay mas|otros|siguientes|siguiente tanda)\b/.test(t)) return 'SIGUIENTE_LOTE';
      if (/\b(lote anterior|grupo anterior|anteriores|volver|regresar|previos|los de antes)\b/.test(t)) return 'ANTERIOR_LOTE';
      if (/\b(leelas todas|leer todas|todas las fichas|todas las opciones|leeme todas)\b/.test(t)) return 'LEER_TODAS';
      if (/\b(la siguiente|el siguiente|siguiente ficha|lee la siguiente|pasa a la siguiente|la que sigue)\b/.test(t)) return 'LEER_SIGUIENTE';
      if (/\b(contactar|contacta|hablar con|comunicar|llamar|escribir al agente|whatsapp del agente|contacto del asesor|con el asesor|con el agente|al agente|al asesor|con el captador|contactar al agente)\b/.test(t)) return 'CONTACTAR_AGENTE';
      if (/\b(enviar|envia|mandar|manda|compartir|comparte|whatsapp|wassap)\b/.test(t)) return 'ENVIAR_WHATSAPP';
      if (/\b(abrir|abre|mostrar|muestra|ver ficha|ver detalle|abrir ficha|abreme|ficha completa)\b/.test(t)) return 'ABRIR_FICHA';
      if (/\b(leer|leeme|leer ficha|cuentame|detalles|informacion completa|dime mas|ampliar|leer descripcion)\b/.test(t)) return 'LEER_FICHA';
    }

    if (/\b(si|dale|ok|okay|correcto|afirmativo|claro|hagamoslo)\b/.test(t) && t.split(' ').length <= 3) return 'CONFIRMAR';
    if (/\b(no|cancelar|nel|para nada|no gracias)\b/.test(t) && t.split(' ').length <= 3) return 'NEGAR';

    return 'BUSCAR';
  }

  // ============================================================
  // NÚMERO DE OPCIÓN
  // ============================================================
  const ORDINALES = {
    'primera':1,'primero':1,'uno':1,'un':1,'la uno':1,
    'segunda':2,'segundo':2,'dos':2,'la dos':2,
    'tercera':3,'tercero':3,'tres':3,'la tres':3,
    'cuarta':4,'cuarto':4,'cuatro':4,
    'quinta':5,'quinto':5,'cinco':5,
    'sexta':6,'sexto':6,'seis':6,
    'septima':7,'septimo':7,'siete':7,
    'octava':8,'octavo':8,'ocho':8,
    'novena':9,'noveno':9,'nueve':9,
    'decima':10,'decimo':10,'diez':10
  };
  function extraerNumeroOpcion(transcript) {
    const t = norm(transcript);
    let m = t.match(/\b(?:opcion|numero|la|el)\s+(\d{1,2})\b/);
    if (m) return parseInt(m[1]);
    m = t.match(/\b(\d{1,2})\b/);
    if (m) return parseInt(m[1]);
    for (const [k,v] of Object.entries(ORDINALES)) {
      if (new RegExp('\\b'+k+'\\b').test(t)) return v;
    }
    return null;
  }

  // ============================================================
  // TTS / WAKE LOCK
  // ============================================================
  function hablar(texto, callback) {
    if (!S.synth) { if (callback) callback(); return; }
    try { S.synth.cancel(); } catch (e) {}
    solicitarWakeLock();
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = CFG.LANG_TTS; u.rate = 1.05; u.pitch = 1.0;
    u.onend = () => { try { callback ? callback() : liberarWakeLock(); } catch (e) { liberarWakeLock(); } };
    u.onerror = () => { if (callback) callback(); };
    S.synth.speak(u);
  }
  function detenerHabla() { try { S.synth.cancel(); } catch (e) {} liberarWakeLock(); }

  async function solicitarWakeLock() {
    if ('wakeLock' in navigator && !S.wakeLock) {
      try { S.wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {}
    }
  }
  function liberarWakeLock() {
    if (S.wakeLock) { try { S.wakeLock.release(); } catch (e) {} S.wakeLock = null; }
  }
  window.solicitarWakeLock = solicitarWakeLock;
  window.liberarWakeLock = liberarWakeLock;

  // ============================================================
  // UI
  // ============================================================
  function mostrarUI(msg) {
    const ui = document.getElementById('uiAsistenteVoz');
    const txt = document.getElementById('textoAsistenteVoz');
    if (txt) txt.textContent = msg;
    if (ui) {
      ui.classList.remove('translate-y-10', 'opacity-0', 'pointer-events-none');
      ui.classList.add('translate-y-0', 'opacity-100', 'pointer-events-auto');
    }
  }
  function actualizarUI(msg) {
    const txt = document.getElementById('textoAsistenteVoz');
    if (txt) txt.textContent = msg;
  }
  function ocultarUI() {
    const ui = document.getElementById('uiAsistenteVoz');
    if (ui) {
      ui.classList.remove('translate-y-0', 'opacity-100', 'pointer-events-auto');
      ui.classList.add('translate-y-10', 'opacity-0', 'pointer-events-none');
    }
  }

  // ============================================================
  // RECONOCIMIENTO
  // ============================================================
  function iniciarEscucha() {
    if (!S.rec) return;
    try { S.fase = 'ESCUCHANDO'; S.rec.start(); } catch (e) {}
  }
  function detenerEscucha() { if (S.rec) { try { S.rec.stop(); } catch (e) {} } }

  function initReconocimiento() {
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Rec) return null;
    const rec = new Rec();
    rec.lang = CFG.LANG_REC;
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      solicitarWakeLock();
      const btn = document.getElementById('btnAsistenteVoz');
      if (btn) btn.classList.add('listening-mic');
      if (S.synth && S.synth.speaking) { try { S.synth.cancel(); } catch (e) {} }
    };
    rec.onresult = (event) => {
      S.fase = 'PROCESANDO';
      const transcript = event.results[0][0].transcript.trim();
      procesarComando(transcript);
    };
    rec.onerror = (event) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.warn('[Eco] Micrófono:', event.error);
      }
    };
    rec.onend = () => {
      const btn = document.getElementById('btnAsistenteVoz');
      if (btn) btn.classList.remove('listening-mic');
      if (S.fase === 'ESCUCHANDO' && S.activo) {
        // No habló → cerramos con gracia
        setTimeout(() => {
          if (S.fase === 'ESCUCHANDO' && S.activo) {
            S.fase = 'IDLE'; S.activo = false; ocultarUI(); liberarWakeLock();
          }
        }, 900);
      }
    };
    return rec;
  }

  // ============================================================
  // SUPABASE QUERY
  // ============================================================
  async function buscarInmuebles(f) {
    const db = getDb();
    if (!db) { console.error('[Eco] Supabase no disponible'); return []; }

    let q = db.from('v_propiedades_catalogo').select('*').eq('estatus', 'Disponible');
    if (f.operacion) q = q.eq('operacion', f.operacion);
    if (f.tipo)      q = q.ilike('tipo', `%${f.tipo}%`);
    if (f.codigo)    q = q.ilike('codigo_eco', `%${f.codigo}%`);
    if (f.precioMin != null) q = q.gte('precio', f.precioMin);
    if (f.precioMax != null) q = q.lte('precio', f.precioMax);
    if (f.habitacionesMin)   q = q.gte('habitaciones', f.habitacionesMin);
    if (f.banosMin)          q = q.gte('banos', f.banosMin);
    if (f.estacionamientosMin) q = q.gte('estacionamientos', f.estacionamientosMin);
    if (f.metrosMin)         q = q.gte('metros', f.metrosMin);
    if (f.vip)               q = q.eq('vip_activo', true);

    if (f.ubicacion) {
      const zonas = f.ubicacion.split(/[,;]+/).map(z => z.trim()).filter(z => z.length > 2);
      if (zonas.length) {
        const orStr = zonas.map(z => `ubicacion.ilike.%${z.replace(/[,]/g,'')}%`).join(',');
        q = q.or(orStr);
      }
    }
    if (f.bondades && f.bondades.length) {
      const orStr = f.bondades.map(b => `descripcion.ilike.%${b.replace(/[,]/g,'')}%`).join(',');
      q = q.or(orStr);
    }

    q = q.order('vip_activo', { ascending: false })
         .order('fecha_publicacion', { ascending: false })
         .limit(CFG.MAX_RESULTADOS);

    const { data, error } = await q;
    if (error) { console.error('[Eco] Búsqueda:', error); return []; }
    return data || [];
  }

  // ============================================================
  // RENDER CARRUSEL
  // ============================================================
  function renderCarrusel() {
    const modal = document.getElementById('modalCarruselVoz');
    const track = document.getElementById('trackCarruselVoz');
    const indicador = document.getElementById('loteIndicadorVoz');
    if (!modal || !track) return;

    track.innerHTML = '';
    const inicio = S.loteActual * CFG.TAMANO_LOTE;
    const fin = Math.min(inicio + CFG.TAMANO_LOTE, S.resultados.length);
    const lote = S.resultados.slice(inicio, fin);
    if (indicador) indicador.textContent = `Mostrando ${inicio+1}-${fin} de ${S.resultados.length}`;

    lote.forEach((p, idx) => {
      const indexReal = inicio + idx + 1;
      const foto = (p.fotos && p.fotos.length) ? p.fotos[0]
        : 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=800&q=80';
      const card = document.createElement('div');
      card.className = 'min-w-[220px] max-w-[220px] bg-gray-800/95 rounded-xl overflow-hidden border border-emerald-500/50 shadow-xl flex-shrink-0 snap-start flex flex-col hover:border-emerald-400 transition';
      card.innerHTML = `
        <div class="h-28 overflow-hidden relative cursor-pointer" onclick="window._ecoVoiceAbrirFicha(${idx})">
          <img src="${esc(foto)}" class="w-full h-full object-cover" />
          <span class="absolute top-1.5 left-1.5 bg-emerald-600 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full">Opción ${indexReal}</span>
          <span class="absolute bottom-1.5 right-1.5 bg-black/75 text-white text-[10px] px-2 py-0.5 rounded font-black">${fmtPrecio(p.precio)}</span>
        </div>
        <div class="p-2.5 flex flex-col gap-1.5">
          <h5 class="text-[11px] font-bold text-white line-clamp-1">${esc(p.titulo)}</h5>
          <p class="text-[10px] text-emerald-400 truncate"><i class="fa-solid fa-location-dot"></i> ${esc(p.ubicacion)}</p>
          <div class="flex gap-1 mt-1">
            <button onclick="window._ecoVoiceLeerFicha(${idx})" class="flex-1 bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-200 text-[9px] font-bold py-1 rounded border border-cyan-500/30">Leer</button>
            <button onclick="window._ecoVoiceEnviarWA(${idx})" class="flex-1 bg-green-600/30 hover:bg-green-600/50 text-green-200 text-[9px] font-bold py-1 rounded border border-green-500/30">WhatsApp</button>
            <button onclick="window._ecoVoiceAbrirFicha(${idx})" class="flex-1 bg-slate-600/40 hover:bg-slate-600/60 text-slate-200 text-[9px] font-bold py-1 rounded border border-slate-500/30">Abrir</button>
          </div>
        </div>`;
      track.appendChild(card);
    });

    // Panel de sugerencias (se crea una sola vez)
    let panel = document.getElementById('panelAccionesVoz');
    if (!panel && track.parentElement) {
      panel = document.createElement('div');
      panel.id = 'panelAccionesVoz';
      panel.className = 'mt-2 pt-2 border-t border-gray-800 flex flex-wrap gap-1.5 text-[10px]';
      track.parentElement.appendChild(panel);
    }
    if (panel) {
      panel.innerHTML = `<span class="text-emerald-300 font-bold">💡 Puedes decir:</span>
        <span class="text-gray-300">"Leer la 1"</span>
        <span class="text-gray-500">·</span>
        <span class="text-gray-300">"Siguiente"</span>
        <span class="text-gray-500">·</span>
        <span class="text-gray-300">"Enviar la 2 a mi WhatsApp"</span>
        <span class="text-gray-500">·</span>
        <span class="text-gray-300">"Contactar al agente de la 1"</span>`;
    }

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
  }
  function cerrarCarrusel() {
    const m = document.getElementById('modalCarruselVoz');
    if (m) { m.classList.add('hidden'); m.style.display = 'none'; }
  }

  // ============================================================
  // NARRACIÓN
  // ============================================================
  function describirCorto(p) {
    return `${p.tipo || 'Inmueble'} en ${p.ubicacion || 'zona no especificada'}, ${p.operacion || ''}, por ${fmtPrecio(p.precio)}, código ${p.codigo_eco}`;
  }
  function describirLargo(p) {
    return `${p.operacion || 'Venta'} de ${p.tipo || 'inmueble'} en ${p.ubicacion || 'zona no especificada'}. ` +
      `Código ${p.codigo_eco}. Precio: ${fmtPrecio(p.precio)}. ` +
      `Cuenta con ${p.habitaciones || 0} habitaciones, ${p.banos || 0} baños, ` +
      `${p.estacionamientos || 0} puestos y ${p.metros || 0} metros cuadrados. ` +
      (p.descripcion ? 'Descripción: ' + p.descripcion + ' ' : '') +
      (p.enlace_video ? 'Tiene video disponible. ' : '') +
      '¿Deseas enviarla a tu WhatsApp, contactar al agente, o pasar a la siguiente?';
  }

  function narrarLote(esInicial) {
    const inicio = S.loteActual * CFG.TAMANO_LOTE;
    const fin = Math.min(inicio + CFG.TAMANO_LOTE, S.resultados.length);
    const lote = S.resultados.slice(inicio, fin);
    if (!lote.length) return;

    const total = S.resultados.length;
    let msg = esInicial
      ? `Encontré ${total} inmuebles que coinciden. Te muestro los primeros ${lote.length}. `
      : `Lote ${S.loteActual+1}. Del ${inicio+1} al ${fin}. `;
    lote.forEach((p,i) => { msg += `Opción ${inicio+i+1}: ${describirCorto(p)}. `; });
    msg += '¿Cuál deseas leer, enviar o contactar al agente? Puedes decir "leer la uno", "enviar la dos a mi WhatsApp", o "siguiente".';

    S.fase = 'SELECCIONANDO';
    actualizarUI(`Mostrando ${inicio+1}-${fin} de ${total}`);
    hablar(msg, () => iniciarEscucha());
  }

  function narrarFicha(p) {
    const idx = S.resultados.findIndex(x => x.id === p.id);
    S.indiceFichaEnResultados = idx;
    S.fase = 'LEYENDO_FICHA';
    actualizarUI(`Leyendo ficha ${idx+1}`);
    hablar(`Opción ${idx+1}. ${describirLargo(p)}`, () => iniciarEscucha());
  }

  // ============================================================
  // ACCIONES
  // ============================================================
  function abrirFicha(p) {
    detenerHabla(); cerrarCarrusel();
    if (typeof abrirModal === 'function') abrirModal(p.id);
    else window.open(`${CFG.FRONTEND_ORIGIN}/index.html?codigo=${encodeURIComponent(p.codigo_eco)}`, '_blank');
  }

  function formatearMensajeWA(p) {
    const url = `${CFG.FRONTEND_ORIGIN}/index.html?codigo=${encodeURIComponent(p.codigo_eco)}`;
    return `🏠 *${p.titulo}*\n` +
      `🆔 Código: ${p.codigo_eco}\n` +
      `💰 Precio: ${fmtPrecio(p.precio)}\n` +
      `📍 Ubicación: ${p.ubicacion || ''}\n` +
      `🏷️ Operación: ${p.operacion || ''}\n` +
      `🛏️ Hab: ${p.habitaciones||0} | 🚿 Baños: ${p.banos||0} | 🚗 Puestos: ${p.estacionamientos||0}\n` +
      `📐 Área: ${p.metros||0} m²\n` +
      `👤 Asesor: ${p.nombre_asesor || 'EcoNexus'}\n` +
      `🔗 Ver ficha: ${url}`;
  }

  function abrirWhatsAppMi(texto) {
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`,
      '_blank', 'noopener,noreferrer');
  }
  function abrirWhatsAppAgente(p, extra) {
    const tel = (p.telefono_asesor || '').replace(/[^0-9]/g, '');
    const intro = `Hola ${p.nombre_asesor || 'asesor'}, me interesa el inmueble *${p.codigo_eco}*. ${extra || ''}`;
    const texto = intro + '\n\n' + formatearMensajeWA(p);
    const url = tel
      ? `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function mostrarModalEnvioWhatsApp(p, modo) {
    detenerHabla(); detenerEscucha();
    const existente = document.getElementById('ecoVoiceWaModal');
    if (existente) existente.remove();

    const mostrarMi = (modo === 'mi' || modo === 'ambos');
    const mostrarAg = (modo === 'agente' || modo === 'ambos');
    const previewMi = formatearMensajeWA(p);
    const previewAg = `Para el asesor ${p.nombre_asesor || ''} (${p.telefono_asesor || 's/t'}):\n\nHola, me interesa el inmueble ${p.codigo_eco}.\n\n` + previewMi;
    const preview = mostrarAg && !mostrarMi ? previewAg : previewMi;

    const html = `
      <div id="ecoVoiceWaModal" class="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl max-w-lg w-full p-5 shadow-2xl relative border-t-4 border-green-600">
          <button onclick="document.getElementById('ecoVoiceWaModal').remove(); window._ecoVoiceResume();" class="absolute top-3 right-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full w-8 h-8 flex items-center justify-center"><i class="fa-solid fa-xmark"></i></button>
          <div class="flex items-center gap-2 text-green-700 font-bold mb-2">
            <i class="fa-brands fa-whatsapp text-2xl"></i>
            <span class="text-sm uppercase">${mostrarAg && !mostrarMi ? 'Contactar al Asesor' : 'Enviar a mi WhatsApp'}</span>
          </div>
          <p class="text-xs text-gray-600 mb-3">Revisa el mensaje. Al pulsar "Abrir WhatsApp" solo tendrás que dar clic en <b>enviar</b> dentro de WhatsApp.</p>
          <pre class="bg-gray-50 border border-gray-200 rounded-xl p-3 text-[11px] text-gray-800 whitespace-pre-wrap max-h-64 overflow-y-auto mb-4 font-mono">${esc(preview)}</pre>
          <div class="flex flex-col sm:flex-row gap-2">
            <button onclick="document.getElementById('ecoVoiceWaModal').remove(); window._ecoVoiceResume();" class="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl text-xs">Cancelar</button>
            ${mostrarMi ? `<button id="btnWaMi" class="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 shadow"><i class="fa-brands fa-whatsapp"></i> Abrir en mi WhatsApp</button>` : ''}
            ${mostrarAg ? `<button id="btnWaAg" class="flex-1 bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 shadow"><i class="fa-brands fa-whatsapp"></i> Contactar al Agente</button>` : ''}
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    const btnMi = document.getElementById('btnWaMi');
    const btnAg = document.getElementById('btnWaAg');
    if (btnMi) btnMi.onclick = () => { abrirWhatsAppMi(formatearMensajeWA(p)); document.getElementById('ecoVoiceWaModal').remove(); window._ecoVoiceResume(); };
    if (btnAg) btnAg.onclick = () => { abrirWhatsAppAgente(p, ''); document.getElementById('ecoVoiceWaModal').remove(); window._ecoVoiceResume(); };
    hablar('He preparado el mensaje. Revisa la vista previa y pulsa el botón. Solo faltará darle enviar dentro de WhatsApp.');
  }

  window._ecoVoiceResume = function () {
    if (S.activo) { S.fase = 'ESCUCHANDO'; setTimeout(() => iniciarEscucha(), 250); }
  };

  // ============================================================
  // DISPATCHER PRINCIPAL
  // ============================================================
  async function procesarComando(transcript) {
    console.log('[Eco] 🎤', transcript);
    try {
      const t = norm(transcript);
      const intent = detectarIntencion(transcript, S.fase);

      // ---- DETENER ----
      if (intent === 'DETENER') {
        detenerHabla(); detenerEscucha(); cerrarCarrusel(); ocultarUI();
        S.activo = false; S.fase = 'IDLE';
        return;
      }
      // ---- REPETIR ----
      if (intent === 'REPETIR') {
        if (S.fase === 'LEYENDO_FICHA' && S.indiceFichaEnResultados >= 0) {
          narrarFicha(S.resultados[S.indiceFichaEnResultados]);
        } else if (S.resultados.length) {
          narrarLote(S.loteActual === 0);
        } else {
          hablar('No tengo nada que repetir. Dime qué buscas, por ejemplo: "casa en venta en Prebo hasta cien mil dólares".', () => iniciarEscucha());
        }
        return;
      }
      // ---- AYUDA ----
      if (intent === 'AYUDA') {
        hablar('Soy Eco, tu estratega inmobiliario. Puedo buscar inmuebles por zona, tipo, operación, precio, habitaciones, baños, metros o bondades como planta eléctrica, pozo o piscina. Dime por ejemplo: "busca casa en venta en Prebo hasta cien mil con tres habitaciones". Cuando te muestre opciones, puedes decir "leer la dos", "siguiente", "enviar la uno a mi WhatsApp" o "contactar al agente de la tres". ¿Qué deseas buscar?', () => iniciarEscucha());
        return;
      }
      // ---- SALUDO ----
      if (intent === 'SALUDO' && S.fase !== 'SELECCIONANDO') {
        hablar(`Hola, soy ${CFG.NOMBRE}, ${CFG.ROL}. Dime qué inmueble buscas: zona, tipo, operación y presupuesto. Por ejemplo: "casa en venta en Prebo hasta cien mil dólares".`, () => iniciarEscucha());
        return;
      }
      // ---- LIMPIAR ----
      if (intent === 'LIMPIAR') {
        S.filtros = {}; S.resultados = []; S.loteActual = 0; S.indiceFichaEnResultados = -1;
        cerrarCarrusel();
        hablar('He limpiado la búsqueda. Dime qué inmueble buscas ahora.', () => iniciarEscucha());
        return;
      }
      // ---- CONTAR ----
      if (intent === 'CONTAR') {
        if (S.resultados.length) hablar(`Tengo ${S.resultados.length} inmuebles que coinciden con tu búsqueda. ¿Quieres que siga leyendo o enviar alguna a tu WhatsApp?`, () => iniciarEscucha());
        else hablar('Aún no he hecho una búsqueda. Dime qué buscas, por ejemplo "apartamento en alquiler en Naguanagua".', () => iniciarEscucha());
        return;
      }
      // ---- ORDENAR ----
      if (intent === 'ORDEN_BARATO' || intent === 'ORDEN_CARO') {
        if (!S.resultados.length) { hablar('No hay resultados activos. Dime qué buscas.', () => iniciarEscucha()); return; }
        S.resultados.sort((a,b) => intent === 'ORDEN_BARATO'
          ? (a.precio||0) - (b.precio||0)
          : (b.precio||0) - (a.precio||0));
        S.loteActual = 0; renderCarrusel();
        narrarLote(true);
        return;
      }
      // ---- SIGUIENTE / ANTERIOR LOTE ----
      if (intent === 'SIGUIENTE_LOTE') {
        if (!S.resultados.length) { hablar('No hay resultados activos. Dime qué buscas para empezar.', () => iniciarEscucha()); return; }
        const totalLotes = Math.ceil(S.resultados.length / CFG.TAMANO_LOTE);
        if (S.loteActual + 1 >= totalLotes) {
          hablar(`Ya te mostré todas las ${S.resultados.length} opciones. Puedes decir "volver al inicio" o cambiar de búsqueda.`);
          return;
        }
        S.loteActual++; renderCarrusel(); narrarLote(false);
        return;
      }
      if (intent === 'ANTERIOR_LOTE') {
        if (!S.resultados.length) { hablar('No hay resultados.', () => iniciarEscucha()); return; }
        if (S.loteActual === 0) { hablar('Ya estás en el primer lote.', () => iniciarEscucha()); return; }
        S.loteActual--; renderCarrusel(); narrarLote(false);
        return;
      }
      // ---- LEER TODAS ----
      if (intent === 'LEER_TODAS') {
        if (!S.resultados.length) { hablar('No hay resultados.', () => iniciarEscucha()); return; }
        const txt = S.resultados.map((p,i) => `Opción ${i+1}: ${describirCorto(p)}.`).join(' ');
        hablar(`Te leo las ${S.resultados.length} opciones. ${txt}`, () => iniciarEscucha());
        return;
      }
      // ---- ACCIONES SOBRE OPCIÓN ----
      if (['LEER_FICHA','ABRIR_FICHA','ENVIAR_WHATSAPP','CONTACTAR_AGENTE','LEER_SIGUIENTE','LEER_ANTERIOR'].includes(intent)) {
        if (!S.resultados.length) { hablar('Primero necesito que busques algo. Dime por ejemplo "casa en venta en Prebo".', () => iniciarEscucha()); return; }

        let idx = null;
        if (intent === 'LEER_SIGUIENTE') {
          idx = (S.indiceFichaEnResultados >= 0 && S.indiceFichaEnResultados + 1 < S.resultados.length)
            ? S.indiceFichaEnResultados + 1 : 0;
        } else if (intent === 'LEER_ANTERIOR') {
          idx = (S.indiceFichaEnResultados > 0) ? S.indiceFichaEnResultados - 1 : 0;
        } else {
          const n = extraerNumeroOpcion(transcript);
          if (n && n >= 1 && n <= S.resultados.length) idx = n - 1;
          else if (S.indiceFichaEnResultados >= 0) idx = S.indiceFichaEnResultados;
          else idx = 0;
        }

        if (idx === null || idx < 0 || idx >= S.resultados.length) {
          hablar('No identifiqué el número de la opción. Dime por ejemplo "leer la uno" o "enviar la dos".');
          return;
        }
        const inm = S.resultados[idx];

        if (intent === 'LEER_FICHA' || intent === 'LEER_SIGUIENTE' || intent === 'LEER_ANTERIOR') {
          narrarFicha(inm); return;
        }
        if (intent === 'ABRIR_FICHA') {
          abrirFicha(inm);
          hablar('Abriendo la ficha completa.');
          return;
        }
        if (intent === 'ENVIAR_WHATSAPP') {
          mostrarModalEnvioWhatsApp(inm, 'mi'); return;
        }
        if (intent === 'CONTACTAR_AGENTE') {
          mostrarModalEnvioWhatsApp(inm, 'agente'); return;
        }
      }

      // ---- BUSCAR (fallback) ----
      const nuevos = extraerFiltros(transcript);
      const tieneNuevos = Object.keys(nuevos).length > 0;
      if (!tieneNuevos && Object.keys(S.filtros).length === 0) {
        hablar('No entendí qué buscar. Dime por ejemplo: "casa en venta en Prebo hasta cien mil dólares con tres habitaciones".', () => iniciarEscucha());
        return;
      }
      if (tieneNuevos) S.filtros = Object.assign({}, S.filtros, nuevos);

      actualizarUI('Buscando inmuebles con esos criterios...');
      const resultados = await buscarInmuebles(S.filtros);
      if (!resultados.length) {
        hablar('No encontré inmuebles con esos criterios. Intenta ampliar la zona o el presupuesto, o dime otra característica.', () => iniciarEscucha());
        return;
      }
      S.resultados = resultados;
      S.loteActual = 0;
      S.indiceFichaEnResultados = -1;
      renderCarrusel();
      narrarLote(true);
    } catch (err) {
      console.error('[Eco] Error procesando comando:', err);
      S.fase = 'ESCUCHANDO';
      hablar('Tuve un problema procesando tu solicitud. ¿Puedes repetirlo?', () => iniciarEscucha());
    }
  }

  // ============================================================
  // HANDLERS DEL CARRUSEL
  // ============================================================
  window._ecoVoiceAbrirFicha = function (idxLote) {
    const idx = S.loteActual * CFG.TAMANO_LOTE + idxLote;
    if (S.resultados[idx]) abrirFicha(S.resultados[idx]);
  };
  window._ecoVoiceLeerFicha = function (idxLote) {
    const idx = S.loteActual * CFG.TAMANO_LOTE + idxLote;
    if (S.resultados[idx]) narrarFicha(S.resultados[idx]);
  };
  window._ecoVoiceEnviarWA = function (idxLote) {
    const idx = S.loteActual * CFG.TAMANO_LOTE + idxLote;
    if (S.resultados[idx]) mostrarModalEnvioWhatsApp(S.resultados[idx], 'mi');
  };
  window._ecoVoiceContactarAgente = function (idxLote) {
    const idx = S.loteActual * CFG.TAMANO_LOTE + idxLote;
    if (S.resultados[idx]) mostrarModalEnvioWhatsApp(S.resultados[idx], 'agente');
  };

  // ============================================================
  // API PÚBLICA
  // ============================================================
  window.iniciarAsistenteVoz = function () {
    if (!S.rec) {
      alert('Tu navegador no soporta reconocimiento de voz. Usa Chrome, Edge o Safari actualizado.');
      return;
    }
    const waModal = document.getElementById('ecoVoiceWaModal');
    if (waModal) waModal.remove();

    if (S.activo) {
      S.fase = 'ESCUCHANDO';
      mostrarUI('Te escucho...');
      iniciarEscucha();
      return;
    }
    S.activo = true; S.fase = 'ESCUCHANDO';
    mostrarUI(`${CFG.NOMBRE} te está escuchando...`);
    const saludo = `Hola, soy ${CFG.NOMBRE}, ${CFG.ROL}. Estoy listo para ayudarte a encontrar el inmueble perfecto. Dime por ejemplo: "casa en venta en Prebo hasta cien mil dólares", o "apartamento en alquiler en Naguanagua con tres habitaciones".`;
    hablar(saludo, () => iniciarEscucha());
  };

  window.detenerAsistenteVoz = function () {
    S.activo = false; S.fase = 'IDLE';
    detenerHabla(); detenerEscucha(); cerrarCarrusel(); ocultarUI(); liberarWakeLock();
  };

  window.cerrarModalCarruselVoz = function () { cerrarCarrusel(); };

  // ============================================================
  // INIT
  // ============================================================
  function init() {
    S.rec = initReconocimiento();
    if (!S.rec) console.warn('[Eco] Reconocimiento de voz NO soportado');
    getDb();
    console.log('[Eco] Asistente v2 listo — "tu estratega inmobiliario"');
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
