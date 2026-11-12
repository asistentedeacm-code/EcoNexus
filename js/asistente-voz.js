/**
 * ECONEXUS VOICE ASSISTANT v7 — "Eco, tu estratega inmobiliario"
 * 100% determinístico. Motor de reglas + Supabase directo.
 * Ubicación: /js/asistente-voz.js
 *
 * v7 = v5 (funcional) + v6 (mejoras) conectados:
 *  - Carrusel de 3 restaurado como UI primaria (v5)
 *  - Browse modal de 10 opcional (v6)
 *  - Narración SIEMPRE ocurre (fix del "problema al procesar")
 *  - Quitar filtros (v6)
 *  - Multi-envío "1 y 5 y 8" (v6)
 *  - "siguiente" en SELECCIONANDO = siguiente ficha (v6)
 *  - Polling de cierre del modal del index (v6)
 *  - Detección de zonas intacta (v5)
 */
(function () {
  'use strict';

  // ══════════════════════════════════════════════════════════════
  // CONFIG
  // ══════════════════════════════════════════════════════════════
  const CFG = {
    SUPABASE_URL: 'https://gvcklmqldswxfweliuio.supabase.co',
    SUPABASE_KEY: 'sb_publishable_Yu3I-FpcjU44dHsPs9pPDQ_9TEC9fKa',
    WORKER_URL: 'https://econexus-engine.asistentedeacm.workers.dev',
    FRONTEND_ORIGIN: 'https://econexusplatform.com',
    NOMBRE: 'Eco',
    ROL: 'tu estratega inmobiliario de EcoNexus',
    TAMANO_LOTE: 3,
    TAMANO_PAGINA_BROWSE: 10,
    TAMANO_ENVIO_MAX: 10,
    MAX_RESULTADOS: 200,
    LANG_REC: 'es-VE',
    LANG_TTS: 'es-ES',
    TTS_RATE: 1.0,
    TTS_RATE_PRECIO: 0.92
  };

  // ══════════════════════════════════════════════════════════════
  // ESTADO
  // ══════════════════════════════════════════════════════════════
  const S = {
    activo: false,
    fase: 'IDLE',
    micOn: false,
    procesando: false,
    filtros: {},
    resultados: [],
    loteActual: 0,
    cantidadVisible: 3,
    indiceFichaEnResultados: -1,
    db: null,
    rec: null,
    synth: window.speechSynthesis || null,
    wakeLock: null,
    modalPropiedadAbierto: false,
    pollPropiedadId: null,
    browseAbierto: false
  };

  let TTS_TOKEN = 0;

  // ══════════════════════════════════════════════════════════════
  // UTILIDADES
  // ══════════════════════════════════════════════════════════════
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

  function limpiarTextoParaTTS(texto) {
    if (!texto) return '';
    return String(texto)
      .replace(/(\+?\d{1,3}[\s\-.)]*)?(\(?\d{3,4}\)?[\s\-.)]*)?\d{3}[\s\-.)]*\d{2}[\s\-.)]*\d{2,4}/g, ' [contacto reservado] ')
      .replace(/\b\d{7,15}\b/g, ' [contacto reservado] ')
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
      .replace(/https?:\/\/[^\s]+/gi, '')
      .replace(/www\.[^\s]+/gi, '')
      .replace(/wa\.me\/[^\s]+/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  // ══════════════════════════════════════════════════════════════
  // NÚMERO → PALABRAS
  // ══════════════════════════════════════════════════════════════
  const PAL = {
    U: ['cero','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve',
        'diez','once','doce','trece','catorce','quince','dieciséis','diecisiete','dieciocho','diecinueve',
        'veinte','veintiuno','veintidós','veintitrés','veinticuatro','veinticinco','veintiséis','veintisiete','veintiocho','veintinueve'],
    D: ['','','','','','','','','','','diez','veinte','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa'],
    C: ['','ciento','doscientos','trescientos','cuatrocientos','quinientos','seiscientos','setecientos','ochocientos','novecientos']
  };
  function _menorMil(n) {
    if (n === 0) return '';
    if (n < 30) return PAL.U[n];
    if (n < 100) {
      const d = Math.floor(n / 10), u = n % 10;
      return PAL.D[d] + (u ? ' y ' + PAL.U[u] : '');
    }
    if (n === 100) return 'cien';
    if (n < 1000) {
      const c = Math.floor(n / 100), r = n % 100;
      return PAL.C[c] + (r ? ' ' + _menorMil(r) : '');
    }
    return '';
  }
  function numeroAPalabrasEspanol(n) {
    const num = Math.round(Number(n || 0));
    if (num === 0) return 'cero';
    if (num < 0) return 'menos ' + numeroAPalabrasEspanol(-num);
    if (num < 1000) return _menorMil(num);
    if (num < 1000000) {
      const miles = Math.floor(num / 1000), r = num % 1000;
      const m = miles === 1 ? 'mil' : _menorMil(miles) + ' mil';
      return m + (r ? ' ' + _menorMil(r) : '');
    }
    if (num < 1000000000) {
      const mill = Math.floor(num / 1000000), r = num % 1000000;
      const m = mill === 1 ? 'un millón' : _menorMil(mill) + ' millones';
      return m + (r ? ' ' + numeroAPalabrasEspanol(r) : '');
    }
    return String(num);
  }
  function hablarPrecio(n) {
    const num = Number(n || 0);
    if (!num) return 'precio no especificado';
    const palabras = numeroAPalabrasEspanol(num);
    const conPausas = palabras
      .replace(/\bmil\b/g, ' mil,')
      .replace(/\bmillón\b/g, ' millón,')
      .replace(/\bmillones\b/g, ' millones,')
      .replace(/,+/g, ',')
      .replace(/,\s*$/, '');
    return conPausas + ' dólares';
  }

  function getDb() {
    if (typeof dbClient !== 'undefined' && dbClient) return dbClient;
    if (!S.db && window.supabase && window.supabase.createClient) {
      S.db = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY);
    }
    return S.db;
  }

  // ══════════════════════════════════════════════════════════════
  // PARSEO DE NÚMEROS (para filtros)
  // ══════════════════════════════════════════════════════════════
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
    t = t.replace(/\b(cien|ciento|doscientos|trescientos|cuatrocientos|quinientos|seiscientos|setecientos|ochocientos|novecientos)\s+(veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa)\b/g,
      (m,a,b) => String((WNUM[a]||0)+(WNUM[b]||0)));
    t = t.replace(/\b(cien|ciento|doscientos|trescientos|cuatrocientos|quinientos|seiscientos|setecientos|ochocientos|novecientos)\s+(uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)\b/g,
      (m,a,b) => String((WNUM[a]||0)+(WNUM[b]||0)));
    t = t.replace(/\b(veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa)\s+(y\s+)?(uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)\b/g,
      (m,a,y,b) => String((WNUM[a]||0)+(WNUM[b]||0)));
    t = t.replace(/\b([a-zñ]+)\b/g, (m) => {
      if (m === 'mil') return '1000';
      if (m === 'millon' || m === 'millones') return '1000000';
      if (m === 'medio') return '0.5';
      return WNUM[m] !== undefined ? String(WNUM[m]) : m;
    });
    t = t.replace(/(\d)[.,](\d{3})\b/g, '$1$2');
    t = t.replace(/(\d+)\s+(1000)\b/g, (m,a) => String(parseInt(a)*1000));
    t = t.replace(/(\d+)\s+(1000000)\b/g, (m,a) => String(parseInt(a)*1000000));
    const m = t.match(/(\d+(?:\.\d+)?)/);
    return m ? parseFloat(m[1]) : null;
  }

  // ══════════════════════════════════════════════════════════════
  // DICCIONARIOS NLU
  // ══════════════════════════════════════════════════════════════
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

  const ZONAS_VE = [
    'prebo','trigal','trigaleña','la trigaleña','viñedo','vinedo','el viñedo',
    'naguanagua','san diego','guataparo','mañongo','manongo','santa fe',
    'el hatillo','los palos grandes','las mercedes','el paraiso','la candelaria',
    'el cafetal','prados del este','altamira','chacao','san bernardino',
    'la florida','el recreo','sabana grande','la california','los ruices',
    'valencia','caracas','maracay','barquisimeto','maracaibo','puerto ordaz',
    'carabobo','zulia','miranda','distrito capital','lara','anzoategui'
  ];

  const STOPWORDS_BUSQUEDA = [
    'que','para','por','con','los','las','una','unos','unas','quiero','busco','buscar','buscame',
    'dame','muestrame','muestra','ver','necesito','tengo','hay','algo','algun','alguna','algunos','algunas',
    'lee','leer','leeme','cuentame','dime','abre','abrir','abreme','si','no','ok','vale','bien','gracias',
    'ayuda','ayudame','favor','por favor','el','la','de','del','en','al','a','y','o','un','mi','me','te'
  ];

  // ══════════════════════════════════════════════════════════════
  // EXTRACTOR DE FILTROS
  // ══════════════════════════════════════════════════════════════
  function extraerFiltros(transcript) {
    const t = norm(transcript);
    const out = {};

    for (const [k,v] of Object.entries(OPER_MAP)) {
      if (new RegExp('\\b'+k+'\\b').test(t)) { out.operacion = v; break; }
    }
    for (const [keys,val] of TIPOS_MAP) {
      for (const k of keys) {
        if (new RegExp('\\b'+k.replace(/\s+/g,'\\s+')+'\\b').test(t)) { out.tipo = val; break; }
      }
      if (out.tipo) break;
    }
    let mc = t.match(/\beco[\s\-]?(\d{4,8})\b/);
    if (mc) out.codigo = 'ECO-' + mc[1];
    mc = t.match(/\bcodigo\s+(\d{4,8})\b/);
    if (mc && !out.codigo) out.codigo = 'ECO-' + mc[1];

    const mHab = t.match(/(\d+)\s*(habitacion|habitaciones|hab|cuarto|cuartos|dormitorio|dormitorios|recamara|recamaras)/);
    if (mHab) out.habitacionesMin = parseInt(mHab[1]);
    const mBan = t.match(/(\d+)\s*(bano|banos|sanitario|sanitarios)/);
    if (mBan) out.banosMin = parseInt(mBan[1]);
    const mMet = t.match(/(\d+)\s*(metro|metros|m2|mts)/);
    if (mMet) out.metrosMin = parseInt(mMet[1]);
    const mEst = t.match(/(\d+)\s*(puesto|puestos|estacionamiento|estacionamientos|carro|carros)/);
    if (mEst) out.estacionamientosMin = parseInt(mEst[1]);

    const mP = t.match(/(hasta|maximo|max|menos de|no mas de|tope|presupuesto de|con)\s+([\d\.\,\s]+(?:mil|millon|millones)?)/);
    if (mP) { const n = parseNumeroDesdeTexto(mP[2]); if (n) out.precioMax = n; }
    const mE = t.match(/entre\s+([\d\.\,]+(?:\s*mil)?)\s*y\s*([\d\.\,]+(?:\s*mil)?)/);
    if (mE) {
      const a = parseNumeroDesdeTexto(mE[1]); const b = parseNumeroDesdeTexto(mE[2]);
      if (a) out.precioMin = a; if (b) out.precioMax = b;
    }
    if (!out.precioMax && !out.precioMin) {
      const mSolo = t.match(/(\d{2,3}(?:[\.\,]\d{3})+|\d{3,})\s*(mil|k)?/);
      if (mSolo) { const n = parseNumeroDesdeTexto(mSolo[0]); if (n && n >= 100) out.precioMax = n; }
    }

    const mAs = t.match(/(?:del\s+asesor|de\s+la\s+asesora|del\s+agente|de\s+la\s+agente|del\s+realtor|de\s+la\s+realtor|del\s+captador|de\s+la\s+captadora)\s+([a-zñ]{3,20})/);
    if (mAs && !['con','que','para','por','del','los','las'].includes(mAs[1])) {
      out.asesorNombre = mAs[1];
    }

    const mU = t.match(/\b(?:en|zona|sector|por|de la zona|zona de|sector de|cerca de|por la zona)\s+([a-zñ\s]{3,40}?)(?=\s+(?:hasta|con|maximo|entre|que|para|y|o|de|por|\d)|$)/);
    if (mU) {
      const tokens = mU[1].trim().split(/\s+/).filter(w => {
        if (!w || w.length < 3) return false;
        if (OPER_MAP[w]) return false;
        for (const [keys] of TIPOS_MAP) { if (keys.includes(w)) return false; }
        if (STOPWORDS_BUSQUEDA.includes(w)) return false;
        if (out.asesorNombre && w === out.asesorNombre) return false;
        return true;
      });
      if (tokens.length) out.ubicacion = tokens.join(' ');
    }

    const bonds = BONDADES_KEYS.filter(b => t.includes(b));
    if (bonds.length) out.bondades = bonds;

    if (/\b(vip|destacado|destacados|premium|exclusivo|exclusivos)\b/.test(t)) out.vip = true;

    return out;
  }

  // ══════════════════════════════════════════════════════════════
  // DETECCIÓN DE ZONA SUELTA (v5 — intacto)
  // ══════════════════════════════════════════════════════════════
  function detectarZonaSuelta(transcript) {
    const t = norm(transcript);
    if (!t) return null;
    const words = t.split(' ').filter(Boolean);
    if (words.length < 1 || words.length > 4) return null;

    const meaningful = words.filter(w => {
      if (w.length < 3) return false;
      if (STOPWORDS_BUSQUEDA.includes(w)) return false;
      if (OPER_MAP[w]) return false;
      for (const [keys] of TIPOS_MAP) { if (keys.includes(w)) return false; }
      return true;
    });

    if (meaningful.length === 0) return null;
    if (meaningful.length !== words.length) return null;

    const candidate = meaningful.join(' ');

    for (const z of ZONAS_VE) {
      if (candidate === z) return candidate;
    }
    for (const z of ZONAS_VE) {
      if (z.includes(candidate) || candidate.includes(z)) return candidate;
    }
    if (meaningful.some(w => w.length >= 4)) return candidate;
    return null;
  }

  // ══════════════════════════════════════════════════════════════
  // INTENCIONES
  // ══════════════════════════════════════════════════════════════
  const ORDINALES = {
    'primera':1,'primero':1,'uno':1,'un':1,
    'segunda':2,'segundo':2,'dos':2,
    'tercera':3,'tercero':3,'tres':3,
    'cuarta':4,'cuarto':4,'cuatro':4,
    'quinta':5,'quinto':5,'cinco':5,
    'sexta':6,'sexto':6,'seis':6,
    'septima':7,'septimo':7,'siete':7,
    'octava':8,'octavo':8,'ocho':8,
    'novena':9,'noveno':9,'nueve':9,
    'decima':10,'decimo':10,'diez':10
  };

  const RE_LEER_VERBO = /\b(lee|leer|leeme|leemela|leemelas|leelas|leelos|leela|leelo|léela|léele|léelo|léelas|léelos|cuentame|cuéntame|detalla|detallame|describe|describeme|amplia|ampliar)\b/;
  const RE_LEER_FRASE = /\b(leer ficha|info completa|informacion completa|dime mas|dime sobre|dime la info|dame la info|leer descripcion|lee la descripcion|cuentame mas|cuentame sobre|cuentame la ficha|detalla la ficha|describe la ficha)\b/;
  const RE_SIGUIENTE_NUM = /^(siguiente|sigue|continua|proxima|proximo|next|la siguiente|el siguiente)(\s+(por\s+favor|opcion|ficha|inmueble|uno|una))?\s*$/;
  const RE_ANTERIOR_NUM = /^(atras|anterior|la anterior|el anterior|previo|previa|regresa|regresar)(\s+(por\s+favor|opcion|ficha|inmueble))?\s*$/;
  const RE_SOLO_NUMERO = /^(?:opcion|opcion numero|numero|la|el|la opcion|el numero)?\s*\d{1,2}$/;
  const RE_ENVIAR_VERBO = /\b(enviar|envia|enviarla|enviarlo|enviarlas|enviarlos|envíala|envíalo|envíalas|envíalos|mandar|manda|mandarla|mandarlo|mandarlas|mandarlos|compartir|comparte|compartirla|compartirlo|compartirlas|compartirlos|whatsapp|wassap|wasap)\b/;
  const RE_MOSTRAR_MAS = /\b(ver mas|mostrar mas|mas opciones|otras opciones|siguiente lote|siguiente grupo|lote siguiente|grupo siguiente|ver todas|mostrar todas|cargar mas|ver siguientes|siguiente tanda|ver el resto|ver los demas|mostrar los demas|ver el listado|ver la lista ampliada)\b/;
  const RE_QUITAR_FILTRO = /\b(quita|quitar|elimina|eliminar|borra|borrar|remueve|remover|saca|sacar)\b|\bsin\s+(el|la|los|las)?\s*(filtro|zona|tipo|operacion|precio|habitacion|bano|metro|puesto|vip|asesor|piscina|planta|pozo|terraza|balcon|jardin|amoblado|obra)/;

  function detectarIntencion(transcript) {
    const t = norm(transcript);
    const fase = S.fase;
    const enConversacion = (fase === 'SELECCIONANDO' || fase === 'LEYENDO_FICHA');

    if (enConversacion) {
      if (RE_SOLO_NUMERO.test(t)) return 'LEER_FICHA';
      const words = t.split(' ');
      if (words.length <= 3) {
        for (const w of words) {
          if (ORDINALES[w] !== undefined) return 'LEER_FICHA';
        }
      }
    }

    if (RE_SIGUIENTE_NUM.test(t)) {
      if (fase === 'LEYENDO_FICHA' || fase === 'SELECCIONANDO') return 'LEER_SIGUIENTE';
      return S.resultados.length ? 'LEER_SIGUIENTE' : 'BUSCAR';
    }
    if (RE_ANTERIOR_NUM.test(t)) {
      if (fase === 'LEYENDO_FICHA' || fase === 'SELECCIONANDO') return 'LEER_ANTERIOR';
      return S.resultados.length ? 'LEER_ANTERIOR' : 'BUSCAR';
    }

    if (/\b(para|detente|deten|silencio|stop|cancelar|cancela|basta|quieto|salir)\b/.test(t) && t.split(' ').length <= 3) return 'DETENER';
    if (/\b(repite|repetir|otra vez|de nuevo|como dijiste|que dijiste|no escuche)\b/.test(t)) return 'REPETIR';
    if (/\b(limpiar|limpia|nuevo|nueva busqueda|reiniciar|borrar busqueda|resetear|empezar de nuevo|otra busqueda)\b/.test(t)) return 'LIMPIAR';
    if (/\b(ayuda|ayudame|que puedes hacer|como funciona|como te uso|instrucciones|comandos|muestrame el panel|ver ayuda)\b/.test(t)) return 'AYUDA';
    if (/\b(cuantos|cuantas|cantidad|total de resultados|cuantos hay)\b/.test(t)) return 'CONTAR';
    if (/\b(mas barato|mas economico|menor precio|el barato|los baratos)\b/.test(t)) return 'ORDEN_BARATO';
    if (/\b(mas caro|mayor precio|el costoso|mas costoso|los caros)\b/.test(t)) return 'ORDEN_CARO';
    if (/\b(mapa|abrir mapa|ver mapa|mostrar mapa|ver en mapa|ubicacion en mapa)\b/.test(t)) return 'MAPA';
    if (/\b(hola|buenas|buenos dias|buenas tardes|buenas noches|saludos|hey|que tal|ola)\b/.test(t) && t.split(' ').length <= 4) return 'SALUDO';

    if (RE_QUITAR_FILTRO.test(t)) return 'QUITAR_FILTRO';
    if (RE_MOSTRAR_MAS.test(t)) return 'MOSTRAR_MAS';

    if (/\b(enviar|envia|mandar|manda|compartir|comparte)\s+(todas|todo|el lote|las tres|los tres|las opciones|todo el lote|las fichas|los inmuebles|este lote|estas opciones)\b/.test(t)) return 'ENVIAR_LOTE';
    if (/\b(enviar|envia|mandar|manda|compartir|comparte)\s+(todas|todo)\s+(a|al)\s+(whatsapp|wassap|cliente)\b/.test(t)) return 'ENVIAR_LOTE';

    if (enConversacion) {
      if (/\b(volver a la lista|volver al listado|mostrar lista|ver lista|lista de opciones|regresar a la lista|volver a las opciones|mostrar opciones|ver opciones|volver a los resultados|cerrar la ficha)\b/.test(t)) return 'VOLVER_LISTA';
      if (/\b(leelas todas|leer todas|todas las fichas|todas las opciones|leeme todas)\b/.test(t)) return 'LEER_TODAS';
      if (/\b(abrir y contactar|abrir y llamar|abrir y enviar al agente|abrir y contactar al agente|abrir ficha y contactar|abrir ficha y llamar)\b/.test(t)) return 'ABRIR_Y_CONTACTAR';
      if (/\b(contactar|contacta|hablar con|comunicar|llamar|escribir al agente|whatsapp del agente|contacto del asesor|con el asesor|con el agente|al agente|al asesor|con el captador|contactar al agente|contactar al asesor)\b/.test(t)) return 'CONTACTAR_AGENTE';
      if (RE_ENVIAR_VERBO.test(t)) return 'ENVIAR_WHATSAPP';
      if (/\b(abrir|abre|abreme|abrir ficha|abre ficha|abreme la ficha|mostrar ficha|muestra ficha|ver ficha|ver detalle|ficha completa|abreme el inmueble|abrir el inmueble|muestra el inmueble)\b/.test(t)) return 'ABRIR_FICHA';
      if (RE_LEER_VERBO.test(t) || RE_LEER_FRASE.test(t)) return 'LEER_FICHA';
    }

    if (/\b(si|dale|ok|okay|correcto|afirmativo|claro|hagamoslo)\b/.test(t) && t.split(' ').length <= 3) return 'CONFIRMAR';
    if (/\b(no|cancelar|nel|para nada|no gracias)\b/.test(t) && t.split(' ').length <= 3) return 'NEGAR';

    return 'BUSCAR';
  }

  function extraerNumeroOpcion(transcript) {
    const t = norm(transcript);
    let m = t.match(/\b(?:opcion|opcion numero|numero|la|el)\s+(\d{1,2})\b/);
    if (m) return parseInt(m[1]);
    m = t.match(/\b(\d{1,2})\b(?!\s*(?:hab|habitacion|habitaciones|cuarto|cuartos|dormitorio|dormitorios|recamara|bano|banos|sanitario|sanitarios|metro|metros|m2|mts|puesto|puestos|estacionamiento|estacionamientos|carro|carros|mil|k|dolar|dolares)\b)/i);
    if (m) return parseInt(m[1]);
    for (const [k,v] of Object.entries(ORDINALES)) {
      if (new RegExp('\\b'+k+'\\b').test(t)) return v;
    }
    return null;
  }

  function extraerNumerosMultiples(transcript) {
    const t = norm(transcript);
    const nums = new Set();
    const matches = t.match(/\b(\d{1,2})\b/g) || [];
    for (const m of matches) {
      const n = parseInt(m);
      if (n >= 1 && n <= 50) nums.add(n);
    }
    if (nums.size === 0) {
      for (const [k,v] of Object.entries(ORDINALES)) {
        if (new RegExp('\\b'+k+'\\b').test(t)) nums.add(v);
      }
    }
    return [...nums].sort((a,b) => a-b);
  }

  // ══════════════════════════════════════════════════════════════
  // TTS / WAKE LOCK
  // ══════════════════════════════════════════════════════════════
  function hablar(texto, callback, opts = {}) {
    if (!S.synth) { if (callback) callback(); return; }
    const myToken = ++TTS_TOKEN;
    try { S.synth.cancel(); } catch (e) {}
    solicitarWakeLock();
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = CFG.LANG_TTS;
    u.rate = opts.rate || CFG.TTS_RATE;
    u.pitch = 1.0;
    u.onend = () => {
      if (TTS_TOKEN !== myToken) return;
      try { callback ? callback() : liberarWakeLock(); } catch (e) { liberarWakeLock(); }
    };
    u.onerror = () => {
      if (TTS_TOKEN !== myToken) return;
      if (callback) callback();
    };
    S.synth.speak(u);
  }
  function detenerHabla() {
    TTS_TOKEN++;
    try { S.synth.cancel(); } catch (e) {}
    liberarWakeLock();
  }

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

  // ══════════════════════════════════════════════════════════════
  // UI HELPERS
  // ══════════════════════════════════════════════════════════════
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

  function mostrarPanelAyuda() {
    const existente = document.getElementById('ecoVoiceHelpPanel');
    if (existente) existente.remove();
    const html = `
      <div id="ecoVoiceHelpPanel" class="fixed top-20 left-1/2 -translate-x-1/2 z-[96] w-[92%] max-w-md bg-gray-900/95 backdrop-blur-md text-white rounded-2xl shadow-2xl border-2 border-amber-500/60 p-4">
        <div class="flex justify-between items-start mb-2">
          <h4 class="text-xs font-extrabold text-amber-400 uppercase tracking-wide flex items-center gap-2">
            <i class="fa-solid fa-lightbulb"></i> Cómo hablar con Eco
          </h4>
          <button onclick="document.getElementById('ecoVoiceHelpPanel').remove()" class="text-gray-400 hover:text-white w-6 h-6 flex items-center justify-center rounded-full bg-white/10 cursor-pointer">
            <i class="fa-solid fa-xmark text-xs"></i>
          </button>
        </div>
        <ul class="text-[11px] space-y-1.5 text-gray-200 leading-snug">
          <li>🔍 <b class="text-emerald-400">Buscar:</b> "Prebo" · "casa en venta hasta 100 mil"</li>
          <li>➕ <b class="text-emerald-400">Añadir filtro:</b> "y que tenga piscina"</li>
          <li>➖ <b class="text-emerald-400">Quitar filtro:</b> "quita el filtro de piscina"</li>
          <li>📖 <b class="text-emerald-400">Leer:</b> "lee la 2" · <b class="text-emerald-400">Abrir:</b> "abre la 2"</li>
          <li>⏭️ <b class="text-emerald-400">Siguiente:</b> "siguiente" (lee la siguiente ficha)</li>
          <li>📄 <b class="text-emerald-400">Ver más:</b> "ver más" (+10 opciones)</li>
          <li>📤 <b class="text-emerald-400">Enviar 1:</b> "envía la 2 a mi WhatsApp"</li>
          <li>📤 <b class="text-emerald-400">Enviar varias:</b> "envía la 1 y 5 y 8"</li>
          <li>📤 <b class="text-emerald-400">Enviar todas:</b> "envía todas" (hasta 10)</li>
          <li>🤝 <b class="text-emerald-400">Contactar:</b> "contactar al agente de la 3"</li>
          <li>↩️ <b class="text-emerald-400">Volver:</b> "volver a la lista"</li>
          <li>🛑 <b class="text-emerald-400">Detener:</b> "para"</li>
        </ul>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
  }
  function ocultarPanelAyuda() {
    const p = document.getElementById('ecoVoiceHelpPanel');
    if (p) p.remove();
  }

  // ══════════════════════════════════════════════════════════════
  // RECONOCIMIENTO
  // ══════════════════════════════════════════════════════════════
  function iniciarEscucha() {
    if (!S.rec) return;
    S.micOn = true;
    setTimeout(() => {
      try { S.rec.start(); }
      catch (e) {
        setTimeout(() => {
          try { S.rec.start(); }
          catch (e2) { S.micOn = false; }
        }, 250);
      }
    }, 120);
  }
  function detenerEscucha() {
    if (S.rec) { try { S.rec.abort(); } catch (e) {} }
    S.micOn = false;
  }

  function initReconocimiento() {
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Rec) return null;
    const rec = new Rec();
    rec.lang = CFG.LANG_REC;
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      S.micOn = true;
      solicitarWakeLock();
      const btn = document.getElementById('btnAsistenteVoz');
      if (btn) btn.classList.add('listening-mic');
    };
    rec.onresult = (event) => {
      S.procesando = true;
      const transcript = event.results[0][0].transcript.trim();
      procesarComando(transcript).finally(() => { S.procesando = false; });
    };
    rec.onerror = (event) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.warn('[Eco] Micrófono:', event.error);
      }
    };
    rec.onend = () => {
      S.micOn = false;
      const btn = document.getElementById('btnAsistenteVoz');
      if (btn) btn.classList.remove('listening-mic');
      if (S.activo && !S.procesando) {
        setTimeout(() => {
          if (S.activo && !S.micOn && !S.procesando && !S.modalPropiedadAbierto) {
            S.fase = 'IDLE'; S.activo = false; ocultarUI(); liberarWakeLock();
          }
        }, 900);
      }
    };
    return rec;
  }

  // ══════════════════════════════════════════════════════════════
  // SUPABASE QUERY
  // ══════════════════════════════════════════════════════════════
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
    if (f.asesorNombre)      q = q.ilike('nombre_asesor', `%${f.asesorNombre}%`);

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

  // ═══ FIN PARTE 1/3 ═══
  // [CONTINÚA EN PARTE 2/3]
   // ══════════════════════════════════════════════════════════════
  // RENDER CARRUSEL (v5 — restaurado, UI primaria)
  // Usa los elementos del HTML: #modalCarruselVoz, #trackCarruselVoz, #loteIndicadorVoz
  // ══════════════════════════════════════════════════════════════
  function renderCarrusel() {
    try {
      const modal = document.getElementById('modalCarruselVoz');
      const track = document.getElementById('trackCarruselVoz');
      const indicador = document.getElementById('loteIndicadorVoz');
      if (!modal || !track) {
        console.warn('[Eco] Carrusel HTML no encontrado');
        return;
      }

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
          <div class="h-28 overflow-hidden relative cursor-pointer" onclick="window._ecoVoiceAbrirFichaLote(${idx})">
            <img src="${esc(foto)}" class="w-full h-full object-cover" />
            <span class="absolute top-1.5 left-1.5 bg-emerald-600 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full">Opción ${indexReal}</span>
            <span class="absolute bottom-1.5 right-1.5 bg-black/75 text-white text-[10px] px-2 py-0.5 rounded font-black">${fmtPrecio(p.precio)}</span>
          </div>
          <div class="p-2.5 flex flex-col gap-1.5">
            <h5 class="text-[11px] font-bold text-white line-clamp-1">${esc(p.titulo)}</h5>
            <p class="text-[10px] text-emerald-400 truncate"><i class="fa-solid fa-location-dot"></i> ${esc(p.ubicacion)}</p>
            <div class="flex gap-1 mt-1">
              <button onclick="window._ecoVoiceLeerFichaLote(${idx})" class="flex-1 bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-200 text-[9px] font-bold py-1 rounded border border-cyan-500/30">Leer</button>
              <button onclick="window._ecoVoiceEnviarWALote(${idx})" class="flex-1 bg-green-600/30 hover:bg-green-600/50 text-green-200 text-[9px] font-bold py-1 rounded border border-green-500/30">WhatsApp</button>
              <button onclick="window._ecoVoiceContactarAgenteLote(${idx})" class="flex-1 bg-amber-500/30 hover:bg-amber-500/50 text-amber-200 text-[9px] font-bold py-1 rounded border border-amber-500/30">Agente</button>
            </div>
          </div>`;
        track.appendChild(card);
      });

      let panel = document.getElementById('panelAccionesVoz');
      if (!panel && track.parentElement) {
        panel = document.createElement('div');
        panel.id = 'panelAccionesVoz';
        panel.className = 'mt-2 pt-2 border-t border-gray-800 flex flex-wrap gap-1.5 text-[10px]';
        track.parentElement.appendChild(panel);
      }
      if (panel) {
        panel.innerHTML = `<span class="text-emerald-300 font-bold">💡 Puedes decir:</span>
          <span class="text-gray-300">"Leer la 1"</span>·
          <span class="text-gray-300">"Siguiente"</span>·
          <span class="text-gray-300">"Ver más"</span>·
          <span class="text-gray-300">"Enviar la 2"</span>·
          <span class="text-gray-300">"Enviar todas"</span>`;
      }

      modal.classList.remove('hidden');
      modal.style.display = 'flex';
    } catch (e) {
      console.error('[Eco] renderCarrusel falló:', e);
    }
  }

  function cerrarCarrusel() {
    try {
      const m = document.getElementById('modalCarruselVoz');
      if (m) { m.classList.add('hidden'); m.style.display = 'none'; }
    } catch (e) { console.warn('[Eco] cerrarCarrusel:', e); }
  }

  // ══════════════════════════════════════════════════════════════
  // RENDER BROWSE MODAL (v6 — opcional, secundario)
  // Se abre solo con "ver más" o al pedir opción > 3
  // ══════════════════════════════════════════════════════════════
  function renderBrowseModal() {
    try {
      const prev = document.getElementById('ecoVoiceBrowseModal');
      if (prev) prev.remove();
      if (!S.resultados.length) return;

      const visible = Math.min(S.cantidadVisible, S.resultados.length);
      const hayMas = visible < S.resultados.length;
      const cards = S.resultados.slice(0, visible);

      const cardsHTML = cards.map((p, i) => {
        const foto = (p.fotos && p.fotos.length) ? p.fotos[0]
          : 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=400&q=80';
        const esActiva = (S.indiceFichaEnResultados === i);
        return `
          <div class="bg-gray-800/95 rounded-xl overflow-hidden border ${esActiva ? 'border-cyan-400 ring-2 ring-cyan-400/40' : 'border-emerald-500/30'} shadow-lg flex flex-col transition hover:border-emerald-400">
            <div class="h-24 overflow-hidden relative cursor-pointer" onclick="window._ecoVoiceLeerFichaGlobal(${i})">
              <img src="${esc(foto)}" class="w-full h-full object-cover" loading="lazy" />
              <span class="absolute top-1 left-1 bg-emerald-600 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-full">${i+1}</span>
              <span class="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded font-black">${fmtPrecio(p.precio)}</span>
            </div>
            <div class="p-2 flex flex-col gap-1 flex-grow">
              <h5 class="text-[10px] font-bold text-white line-clamp-1">${esc(p.titulo)}</h5>
              <p class="text-[9px] text-emerald-400 truncate"><i class="fa-solid fa-location-dot"></i> ${esc(p.ubicacion)}</p>
              <p class="text-[9px] text-gray-400 truncate">${esc(p.tipo)} · ${esc(p.operacion)}</p>
            </div>
            <div class="p-1.5 grid grid-cols-3 gap-1">
              <button onclick="window._ecoVoiceLeerFichaGlobal(${i})" title="Leer" class="bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-200 text-[9px] font-bold py-1 rounded border border-cyan-500/30"><i class="fa-solid fa-volume-high"></i></button>
              <button onclick="window._ecoVoiceEnviarWAGlobal(${i})" title="WhatsApp" class="bg-green-600/30 hover:bg-green-600/50 text-green-200 text-[9px] font-bold py-1 rounded border border-green-500/30"><i class="fa-brands fa-whatsapp"></i></button>
              <button onclick="window._ecoVoiceContactarAgenteGlobal(${i})" title="Agente" class="bg-amber-500/30 hover:bg-amber-500/50 text-amber-200 text-[9px] font-bold py-1 rounded border border-amber-500/30"><i class="fa-solid fa-user-tie"></i></button>
            </div>
          </div>`;
      }).join('');

      const restantes = S.resultados.length - visible;
      const html = `
        <div id="ecoVoiceBrowseModal" class="fixed inset-0 bg-black/85 backdrop-blur-sm z-[190] flex items-center justify-center p-2 sm:p-4">
          <div class="bg-gray-900 text-white rounded-2xl max-w-5xl w-full max-h-[94vh] flex flex-col border-2 border-emerald-500/60 shadow-2xl overflow-hidden">
            <div class="p-3 bg-gray-950 border-b border-emerald-500/30 flex items-center justify-between gap-2 shrink-0">
              <div class="min-w-0">
                <h3 class="text-xs sm:text-sm font-extrabold text-emerald-400 flex items-center gap-2">
                  <i class="fa-solid fa-list-check"></i>
                  Resultados <span class="text-amber-400">(${visible} de ${S.resultados.length})</span>
                </h3>
                <p class="text-[10px] text-gray-400 truncate">Di "lee la 3", "envía la 1 y 5", "ver más"</p>
              </div>
              <button onclick="window._ecoVoiceCerrarBrowse()" class="text-gray-400 hover:text-white w-8 h-8 flex items-center justify-center rounded-full bg-white/10 cursor-pointer shrink-0">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div class="flex-1 overflow-y-auto p-2 sm:p-3">
              <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                ${cardsHTML}
              </div>
            </div>
            <div class="p-2.5 bg-gray-950 border-t border-emerald-500/30 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div class="flex items-center gap-2 text-[10px] text-gray-400">
                <i class="fa-solid fa-microphone-lines text-emerald-400"></i>
                <span>Habla o usa los botones</span>
              </div>
              <div class="flex gap-2">
                ${hayMas ? `<button onclick="window._ecoVoiceVerMas()" class="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-gray-900 text-[10px] font-extrabold rounded-lg shadow"><i class="fa-solid fa-plus mr-1"></i> Ver más (+${Math.min(CFG.TAMANO_PAGINA_BROWSE, restantes)})</button>` : `<span class="text-[10px] text-gray-500 px-2 py-1">Todas visibles</span>`}
                <button onclick="window._ecoVoiceCerrarBrowse()" class="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-[10px] font-bold rounded-lg">Cerrar</button>
              </div>
            </div>
          </div>
        </div>`;
      document.body.insertAdjacentHTML('beforeend', html);
      S.browseAbierto = true;
    } catch (e) {
      console.error('[Eco] renderBrowseModal falló:', e);
      S.browseAbierto = false;
    }
  }

  function cerrarBrowseModal() {
    try {
      const m = document.getElementById('ecoVoiceBrowseModal');
      if (m) m.remove();
    } catch (e) {}
    S.browseAbierto = false;
  }

  // ══════════════════════════════════════════════════════════════
  // HANDLERS CARRUSEL (v5)
  // ══════════════════════════════════════════════════════════════
  window._ecoVoiceAbrirFichaLote = function (idxLote) {
    const idx = S.loteActual * CFG.TAMANO_LOTE + idxLote;
    if (S.resultados[idx]) abrirFicha(S.resultados[idx]);
  };
  window._ecoVoiceLeerFichaLote = function (idxLote) {
    const idx = S.loteActual * CFG.TAMANO_LOTE + idxLote;
    if (S.resultados[idx]) narrarFicha(S.resultados[idx]);
  };
  window._ecoVoiceEnviarWALote = function (idxLote) {
    const idx = S.loteActual * CFG.TAMANO_LOTE + idxLote;
    if (S.resultados[idx]) mostrarModalEnvioWhatsApp([S.resultados[idx]], 'mi');
  };
  window._ecoVoiceContactarAgenteLote = function (idxLote) {
    const idx = S.loteActual * CFG.TAMANO_LOTE + idxLote;
    if (S.resultados[idx]) mostrarModalEnvioWhatsApp([S.resultados[idx]], 'agente');
  };

  // ══════════════════════════════════════════════════════════════
  // HANDLERS BROWSE (v6)
  // ══════════════════════════════════════════════════════════════
  window._ecoVoiceVerMas = function () {
    S.cantidadVisible += CFG.TAMANO_PAGINA_BROWSE;
    renderBrowseModal();
    const visible = Math.min(S.cantidadVisible, S.resultados.length);
    const nuevas = Math.max(0, visible - (S.cantidadVisible - CFG.TAMANO_PAGINA_BROWSE));
    hablar(`Ahora ves ${visible} de ${S.resultados.length}. Se agregaron ${nuevas} opciones más.`, () => {
      if (S.activo) iniciarEscucha();
    });
  };
  window._ecoVoiceCerrarBrowse = function () {
    cerrarBrowseModal();
    S.fase = 'SELECCIONANDO';
  };
  window._ecoVoiceLeerFichaGlobal = function (idxGlobal) {
    if (S.resultados[idxGlobal]) narrarFicha(S.resultados[idxGlobal]);
  };
  window._ecoVoiceEnviarWAGlobal = function (idxGlobal) {
    if (S.resultados[idxGlobal]) mostrarModalEnvioWhatsApp([S.resultados[idxGlobal]], 'mi');
  };
  window._ecoVoiceContactarAgenteGlobal = function (idxGlobal) {
    if (S.resultados[idxGlobal]) mostrarModalEnvioWhatsApp([S.resultados[idxGlobal]], 'agente');
  };

  // ══════════════════════════════════════════════════════════════
  // NARRACIÓN
  // ══════════════════════════════════════════════════════════════
  function describirCorto(p) {
    return `${p.tipo || 'Inmueble'} en ${p.ubicacion || 'zona no especificada'}, ${p.operacion || ''}, por ${hablarPrecio(p.precio)}, código ${p.codigo_eco}`;
  }

  function describirLargo(p) {
    const descLimpia = limpiarTextoParaTTS(p.descripcion || '');
    const descCorta = descLimpia.length > 250 ? descLimpia.substring(0, 250) + '...' : descLimpia;
    return `${p.operacion || 'Venta'} de ${p.tipo || 'inmueble'} en ${p.ubicacion || 'zona no especificada'}. ` +
      `Código ${p.codigo_eco}. Precio: ${hablarPrecio(p.precio)}. ` +
      `Cuenta con ${p.habitaciones || 0} habitaciones, ${p.banos || 0} baños, ` +
      `${p.estacionamientos || 0} puestos y ${p.metros || 0} metros cuadrados. ` +
      (descCorta ? 'Descripción: ' + descCorta + ' ' : '') +
      (p.enlace_video ? 'Tiene video disponible. ' : '') +
      '¿Deseas enviarla a tu WhatsApp, contactar al agente, abrir la ficha completa, o pasar a la siguiente?';
  }

  // ══════════════════════════════════════════════════════════════
  // NARRAR LOTE — CRÍTICO: la narración SIEMPRE debe ocurrir
  // Aunque renderCarrusel o renderBrowseModal fallen
  // ══════════════════════════════════════════════════════════════
  function narrarLote(esInicial, prefijo) {
    const total = S.resultados.length;
    if (total === 0) return;

    // 1) Intentar renderizar carrusel (v5) — si falla, seguimos
    try { renderCarrusel(); } catch (e) { console.error('[Eco] renderCarrusel:', e); }

    // 2) Si el browse modal estaba abierto, actualizarlo
    if (S.browseAbierto) {
      try { renderBrowseModal(); } catch (e) { console.error('[Eco] renderBrowseModal:', e); }
    }

    // 3) Construir mensaje de narración
    const aNarrar = Math.min(CFG.TAMANO_LOTE, total);
    const loteNarrado = S.resultados.slice(0, aNarrar);

    let msg = '';
    if (prefijo) {
      msg = prefijo + ' ';
    } else if (esInicial) {
      msg = `Encontré ${numeroAPalabrasEspanol(total)} inmuebles que coinciden. Te muestro los primeros ${aNarrar}. `;
    } else {
      msg = '';
    }
    loteNarrado.forEach((p, i) => {
      msg += `Opción ${i+1}: ${describirCorto(p)}. `;
    });
    if (total > aNarrar) {
      msg += `Y hay ${total - aNarrar} opciones más. Puedes decir "ver más" para verlas todas. `;
    }
    msg += '¿Cuál deseas leer, enviar o contactar al agente? Puedes decir "leer la uno", "siguiente", o "enviar todas a mi WhatsApp".';

    // 4) Estado
    S.fase = 'SELECCIONANDO';
    S.loteActual = 0;
    S.indiceFichaEnResultados = -1;
    if (S.cantidadVisible < CFG.TAMANO_LOTE) {
      S.cantidadVisible = Math.min(CFG.TAMANO_PAGINA_BROWSE, total);
    }

    actualizarUI(`${total} resultados · ${Math.min(CFG.TAMANO_LOTE, total)} en carrusel`);

    // 5) SIEMPRE narrar
    hablar(msg, () => { if (S.activo) iniciarEscucha(); }, { rate: CFG.TTS_RATE_PRECIO });
  }

  // ══════════════════════════════════════════════════════════════
  // NARRAR FICHA — solo narra, NO abre modal del index
  // ══════════════════════════════════════════════════════════════
  function narrarFicha(p) {
    const idx = S.resultados.findIndex(x => x.id === p.id);
    S.indiceFichaEnResultados = idx;
    S.fase = 'LEYENDO_FICHA';

    // Auto-expandir browse modal si el índice supera lo visible
    if (idx >= S.cantidadVisible) {
      S.cantidadVisible = Math.min(
        S.resultados.length,
        Math.ceil((idx + 1) / CFG.TAMANO_PAGINA_BROWSE) * CFG.TAMANO_PAGINA_BROWSE
      );
      if (S.browseAbierto) {
        try { renderBrowseModal(); } catch (e) { console.error('[Eco] browse refresh:', e); }
      }
    }

    // Re-render carrusel si la ficha está en el lote actual
    const loteDeFicha = Math.floor(idx / CFG.TAMANO_LOTE);
    if (loteDeFicha === S.loteActual) {
      try { renderCarrusel(); } catch (e) {}
    }

    actualizarUI(`Leyendo ficha ${idx+1} de ${S.resultados.length}`);
    detenerHabla();

    setTimeout(() => {
      hablar(`Opción ${idx+1}. ${describirLargo(p)}`, () => {
        if (S.activo) iniciarEscucha();
      }, { rate: CFG.TTS_RATE_PRECIO });
    }, 200);
  }

  // ══════════════════════════════════════════════════════════════
  // DESCRIBIR FILTROS AÑADIDOS (feedback hablado)
  // ══════════════════════════════════════════════════════════════
  function describirFiltrosAñadidos(f) {
    const partes = [];
    if (f.operacion) partes.push('operación ' + f.operacion.toLowerCase());
    if (f.tipo) partes.push('tipo ' + f.tipo);
    if (f.ubicacion) partes.push('zona ' + f.ubicacion);
    if (f.precioMax) partes.push('precio máximo ' + numeroAPalabrasEspanol(f.precioMax) + ' dólares');
    if (f.precioMin) partes.push('precio mínimo ' + numeroAPalabrasEspanol(f.precioMin) + ' dólares');
    if (f.habitacionesMin) partes.push(f.habitacionesMin + ' habitaciones mínimo');
    if (f.banosMin) partes.push(f.banosMin + ' baños mínimo');
    if (f.estacionamientosMin) partes.push(f.estacionamientosMin + ' puestos mínimo');
    if (f.metrosMin) partes.push(f.metrosMin + ' metros mínimo');
    if (f.asesorNombre) partes.push('asesor ' + f.asesorNombre);
    if (f.bondades && f.bondades.length) partes.push('bondades ' + f.bondades.join(', '));
    if (f.vip) partes.push('solo VIP');
    if (!partes.length) return 'el filtro';
    if (partes.length === 1) return partes[0];
    return partes.slice(0, -1).join(', ') + ' y ' + partes[partes.length - 1];
  }

  // ═══ FIN PARTE 2/3 ═══
  // [CONTINÚA EN PARTE 3/3]
   // ══════════════════════════════════════════════════════════════
  // ABRIR FICHA (v6: abre modal del index + polling de cierre)
  // ══════════════════════════════════════════════════════════════
  function abrirFicha(p) {
    const idx = S.resultados.findIndex(x => x.id === p.id);
    if (idx >= 0) S.indiceFichaEnResultados = idx;
    S.fase = 'LEYENDO_FICHA';
    S.modalPropiedadAbierto = true;
    detenerHabla();
    cerrarCarrusel();

    try {
      if (typeof abrirModal === 'function') abrirModal(p.id);
      else if (typeof abrirModalPropiedad === 'function') abrirModalPropiedad(p.id);
      else if (typeof abrirModalDirecto === 'function') abrirModalDirecto(p);
      else {
        window.open(`${CFG.FRONTEND_ORIGIN}/index.html?codigo=${encodeURIComponent(p.codigo_eco)}`, '_blank');
        S.modalPropiedadAbierto = false;
        return;
      }
    } catch (e) {
      console.warn('[Eco] abrirFicha falló:', e.message);
      S.modalPropiedadAbierto = false;
      return;
    }

    // Polling: detectar cuando se cierra el modal del index
    if (S.pollPropiedadId) clearInterval(S.pollPropiedadId);
    S.pollPropiedadId = setInterval(() => {
      const modalProp = document.getElementById('propModal');
      const modalAgente = document.getElementById('modalAgente');
      const propCerrado = !modalProp || modalProp.classList.contains('hidden');
      const agCerrado = !modalAgente || modalAgente.classList.contains('hidden');

      if (propCerrado && agCerrado) {
        clearInterval(S.pollPropiedadId);
        S.pollPropiedadId = null;
        onPropiedadModalCerrado(p);
      }
    }, 400);

    setTimeout(() => {
      if (S.pollPropiedadId) { clearInterval(S.pollPropiedadId); S.pollPropiedadId = null; }
    }, 120000);
  }

  function onPropiedadModalCerrado(p) {
    if (!S.modalPropiedadAbierto) return;
    S.modalPropiedadAbierto = false;
    if (!S.activo) return;

    S.fase = 'SELECCIONANDO';
    try { renderCarrusel(); } catch (e) {}
    if (S.browseAbierto) {
      try { renderBrowseModal(); } catch (e) {}
    }
    const idx = S.resultados.findIndex(x => x.id === p.id);
    const idxTxt = idx >= 0 ? `Opción ${idx+1}. ` : '';
    hablar(`${idxTxt}Volviste a la lista de ${S.resultados.length} inmuebles. ¿Qué hacemos? Puedes decir "siguiente", "envía la ${idx+1 > 0 ? idx+1 : 1} a mi WhatsApp", "contactar al agente", o "volver a la lista".`, () => {
      if (S.activo) iniciarEscucha();
    });
  }

  // ══════════════════════════════════════════════════════════════
  // WHATSAPP
  // ══════════════════════════════════════════════════════════════
  function formatearMensajeWAItem(p) {
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

  function formatearMensajeWALote(items) {
    if (!Array.isArray(items)) items = [items];
    if (items.length === 1) return formatearMensajeWAItem(items[0]);
    let msg = `📋 *Selección Inmobiliaria — EcoNexus*\n_${items.length} opciones seleccionadas_\n\n`;
    items.forEach((p, i) => {
      msg += `━━━ Opción ${i+1} ━━━\n`;
      msg += `🏠 *${p.titulo}*\n`;
      msg += `🆔 ${p.codigo_eco}\n`;
      msg += `💰 ${fmtPrecio(p.precio)} • ${p.operacion || ''}\n`;
      msg += `📍 ${p.ubicacion || ''}\n`;
      msg += `🛏️ ${p.habitaciones||0} | 🚿 ${p.banos||0} | 🚗 ${p.estacionamientos||0} | 📐 ${p.metros||0}m²\n`;
      msg += `🔗 ${CFG.FRONTEND_ORIGIN}/index.html?codigo=${encodeURIComponent(p.codigo_eco)}\n\n`;
    });
    return msg.trim();
  }

  function mostrarModalEnvioWhatsApp(items, modo) {
    if (!Array.isArray(items)) items = [items];
    detenerHabla(); detenerEscucha();
    const prev = document.getElementById('ecoVoiceWaModal');
    if (prev) prev.remove();

    const mostrarMi = modo === 'mi' || modo === 'ambos';
    const mostrarAg = modo === 'agente' || modo === 'ambos';

    const previewMi = formatearMensajeWALote(items);
    const urlMi = `https://api.whatsapp.com/send?text=${encodeURIComponent(previewMi)}`;

    let previewAg = '', urlAg = '';
    if (mostrarAg) {
      const p = items[0];
      const tel = (p.telefono_asesor || '').replace(/[^0-9]/g, '');
      const msgAg = `Hola ${p.nombre_asesor || 'asesor'}, me interesa el inmueble *${p.codigo_eco}*.\n\n` + previewMi;
      urlAg = tel
        ? `https://wa.me/${tel}?text=${encodeURIComponent(msgAg)}`
        : `https://api.whatsapp.com/send?text=${encodeURIComponent(msgAg)}`;
      previewAg = `Para: ${p.nombre_asesor || 'asesor'} (${p.telefono_asesor || 's/t'})\n\n${msgAg}`;
    }

    const preview = mostrarAg && !mostrarMi ? previewAg : previewMi;
    const titulo = mostrarAg && !mostrarMi
      ? `Contactar al Asesor · ${items[0].codigo_eco}`
      : items.length > 1
        ? `Enviar ${items.length} opciones a mi WhatsApp`
        : `Enviar ${items[0].codigo_eco} a mi WhatsApp`;

    const onCerrar = `onclick="setTimeout(function(){var m=document.getElementById('ecoVoiceWaModal');if(m)m.remove();window._ecoVoiceResume();}, 600);"`;
    const html = `
      <div id="ecoVoiceWaModal" class="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl max-w-lg w-full p-5 shadow-2xl relative border-t-4 border-green-600 max-h-[92vh] flex flex-col">
          <button onclick="var m=document.getElementById('ecoVoiceWaModal');if(m)m.remove();window._ecoVoiceResume();" class="absolute top-3 right-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full w-8 h-8 flex items-center justify-center"><i class="fa-solid fa-xmark"></i></button>
          <div class="flex items-center gap-2 text-green-700 font-bold mb-2">
            <i class="fa-brands fa-whatsapp text-2xl"></i>
            <span class="text-sm uppercase">${titulo}</span>
          </div>
          <p class="text-xs text-gray-600 mb-3">Revisa el mensaje. Al pulsar el botón se abrirá WhatsApp; solo tendrás que dar clic en <b>enviar</b>.</p>
          <pre class="bg-gray-50 border border-gray-200 rounded-xl p-3 text-[11px] text-gray-800 whitespace-pre-wrap max-h-64 overflow-y-auto mb-4 font-mono flex-1">${esc(preview)}</pre>
          <div class="flex flex-col sm:flex-row gap-2 shrink-0">
            <button onclick="var m=document.getElementById('ecoVoiceWaModal');if(m)m.remove();window._ecoVoiceResume();" class="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl text-xs">Cancelar</button>
            ${mostrarMi ? `<a href="${urlMi}" target="_blank" rel="noopener noreferrer" ${onCerrar} class="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 shadow text-center"><i class="fa-brands fa-whatsapp"></i> Abrir en mi WhatsApp</a>` : ''}
            ${mostrarAg ? `<a href="${urlAg}" target="_blank" rel="noopener noreferrer" ${onCerrar} class="flex-1 bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 shadow text-center"><i class="fa-brands fa-whatsapp"></i> Contactar al Agente</a>` : ''}
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    hablar(`He preparado el mensaje${items.length > 1 ? ' con ' + items.length + ' opciones' : ''}. Revisa la vista previa y pulsa el botón.`);
  }

  window._ecoVoiceResume = function () {
    if (!S.activo) return;
    if (document.hidden) { actualizarUI('Pulsa el micrófono al volver'); return; }
    if (S.fase === 'SELECCIONANDO' || S.fase === 'LEYENDO_FICHA') {
      setTimeout(() => { if (S.activo && !document.hidden) iniciarEscucha(); }, 300);
    }
  };

  // ══════════════════════════════════════════════════════════════
  // QUITAR FILTRO (v6)
  // ══════════════════════════════════════════════════════════════
  function detectarFiltroAEliminar(transcript) {
    const t = norm(transcript);

    for (const b of BONDADES_KEYS) {
      const regexB = new RegExp('(quita|quitar|elimina|eliminar|borra|borrar|remueve|remover|saca|sacar|sin)\\s+(el\\s+|la\\s+|los\\s+|las\\s+)?(filtro\\s+de\\s+)?' + b.replace(/\s+/g, '\\s+'));
      if (regexB.test(t)) return { tipo: 'bondad', valor: b };
    }

    if (/(quita|quitar|elimina|eliminar|borra|borrar|remueve|remover|saca|sacar|sin)\s+(la\s+|el\s+)?(zona|ubicacion|sector|barrio)/.test(t)) return { tipo: 'ubicacion' };
    if (/(quita|quitar|elimina|eliminar|borra|borrar|remueve|remover|saca|sacar|sin)\s+(el\s+|la\s+)?(tipo|categoria)/.test(t)) return { tipo: 'tipo' };
    if (/(quita|quitar|elimina|eliminar|borra|borrar|remueve|remover|saca|sacar|sin)\s+(la\s+|el\s+)?(operacion|venta|alquiler)/.test(t)) return { tipo: 'operacion' };
    if (/(quita|quitar|elimina|eliminar|borra|borrar|remueve|remover|saca|sacar|sin)\s+(el\s+|la\s+)?(precio|presupuesto|costo|tope)/.test(t)) return { tipo: 'precio' };
    if (/(quita|quitar|elimina|eliminar|borra|borrar|remueve|remover|saca|sacar|sin)\s+(las?\s+)?(habitaciones|cuartos)/.test(t)) return { tipo: 'habitaciones' };
    if (/(quita|quitar|elimina|eliminar|borra|borrar|remueve|remover|saca|sacar|sin)\s+(los?\s+)?(banos|sanitarios)/.test(t)) return { tipo: 'banos' };
    if (/(quita|quitar|elimina|eliminar|borra|borrar|remueve|remover|saca|sacar|sin)\s+(los?\s+)?(metros|m2)/.test(t)) return { tipo: 'metros' };
    if (/(quita|quitar|elimina|eliminar|borra|borrar|remueve|remover|saca|sacar|sin)\s+(los?\s+)?(puestos|estacionamiento)/.test(t)) return { tipo: 'estacionamientos' };
    if (/(quita|quitar|elimina|eliminar|borra|borrar|remueve|remover|saca|sacar|sin)\s+(los?\s+)?(vip|destacados)/.test(t)) return { tipo: 'vip' };
    if (/(quita|quitar|elimina|eliminar|borra|borrar|remueve|remover|saca|sacar|sin)\s+(el\s+|la\s+)?(asesor|agente)/.test(t)) return { tipo: 'asesorNombre' };

    if (/(borra|quita|elimina|limpia|reset|reinicia|elimina)\s+(todos?\s+)?(los\s+)?filtros?/.test(t)) return { tipo: 'todos' };

    return null;
  }

  // ══════════════════════════════════════════════════════════════
  // DISPATCHER PRINCIPAL
  // ══════════════════════════════════════════════════════════════
  async function procesarComando(transcript) {
    console.log('[Eco] 🎤', transcript, '| fase:', S.fase);
    try {
      const t = norm(transcript);
      const intent = detectarIntencion(transcript);
      console.log('[Eco] 🧠 intent:', intent);

      // ---- DETENER ----
      if (intent === 'DETENER') {
        detenerHabla(); detenerEscucha(); cerrarCarrusel(); cerrarBrowseModal(); ocultarUI(); ocultarPanelAyuda();
        if (S.pollPropiedadId) { clearInterval(S.pollPropiedadId); S.pollPropiedadId = null; }
        S.activo = false; S.fase = 'IDLE'; S.modalPropiedadAbierto = false;
        return;
      }

      // ---- REPETIR ----
      if (intent === 'REPETIR') {
        if (S.fase === 'LEYENDO_FICHA' && S.indiceFichaEnResultados >= 0 && S.resultados[S.indiceFichaEnResultados]) {
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
        mostrarPanelAyuda();
        hablar('He abierto el panel de ayuda. Puedes buscar solo por zona como "Prebo"; combinar filtros; añadir filtros como "y que tenga piscina"; quitar filtros como "quita el filtro de piscina"; leer una ficha diciendo "lee la dos"; abrir la ficha completa con "abre la dos"; avanzar con "siguiente"; ver más opciones con "ver más"; enviar varias con "envía la 1 y 5 y 8"; enviar todas con "envía todas"; y contactar al agente. ¿Qué deseas hacer?', () => iniciarEscucha());
        return;
      }

      // ---- SALUDO ----
      if (intent === 'SALUDO' && S.fase !== 'SELECCIONANDO') {
        mostrarPanelAyuda();
        hablar(`Hola, soy ${CFG.NOMBRE}, ${CFG.ROL}. Te dejé un panel de ayuda en pantalla. Dime solo una zona como "Prebo", o combina filtros: "casa en venta en Prebo hasta cien mil dólares".`, () => iniciarEscucha());
        return;
      }

      // ---- LIMPIAR ----
      if (intent === 'LIMPIAR') {
        S.filtros = {}; S.resultados = []; S.loteActual = 0; S.indiceFichaEnResultados = -1; S.cantidadVisible = CFG.TAMANO_PAGINA_BROWSE;
        S.fase = 'IDLE';
        cerrarCarrusel(); cerrarBrowseModal();
        hablar('He limpiado la búsqueda. Dime qué inmueble buscas ahora.', () => iniciarEscucha());
        return;
      }

      // ---- CONTAR ----
      if (intent === 'CONTAR') {
        if (S.resultados.length) hablar(`Tengo ${numeroAPalabrasEspanol(S.resultados.length)} inmuebles que coinciden. ¿Quieres que siga leyendo, enviar alguna, o ver más?`, () => iniciarEscucha());
        else hablar('Aún no he hecho una búsqueda. Dime qué buscas, por ejemplo "apartamento en alquiler en Naguanagua".', () => iniciarEscucha());
        return;
      }

      // ---- ORDENAR ----
      if (intent === 'ORDEN_BARATO' || intent === 'ORDEN_CARO') {
        if (!S.resultados.length) { hablar('No hay resultados activos. Dime qué buscas.', () => iniciarEscucha()); return; }
        S.resultados.sort((a,b) => intent === 'ORDEN_BARATO'
          ? (a.precio||0) - (b.precio||0)
          : (b.precio||0) - (a.precio||0));
        narrarLote(true, intent === 'ORDEN_BARATO' ? 'Ordenado del más barato al más caro.' : 'Ordenado del más caro al más barato.');
        return;
      }

      // ---- MAPA ----
      if (intent === 'MAPA') {
        detenerHabla(); cerrarCarrusel(); cerrarBrowseModal();
        if (typeof abrirModalMapaGlobal === 'function') {
          abrirModalMapaGlobal();
          hablar('Abriendo el mapa con las propiedades disponibles.');
        } else {
          hablar('El mapa no está disponible en esta página.', () => iniciarEscucha());
        }
        return;
      }

      // ---- QUITAR FILTRO ----
      if (intent === 'QUITAR_FILTRO') {
        const filtro = detectarFiltroAEliminar(transcript);
        if (!filtro) {
          hablar('No entendí qué filtro quieres eliminar. Puedes decir "quita el filtro de piscina", "elimina la zona", "borra el precio", o "quita todos los filtros".', () => iniciarEscucha());
          return;
        }

        let eliminadoDesc = '';
        if (filtro.tipo === 'todos') {
          S.filtros = {};
          eliminadoDesc = 'todos los filtros';
        } else if (filtro.tipo === 'bondad') {
          if (S.filtros.bondades) {
            const antes = S.filtros.bondades.length;
            S.filtros.bondades = S.filtros.bondades.filter(b => b !== filtro.valor);
            if (!S.filtros.bondades.length) delete S.filtros.bondades;
            eliminadoDesc = `la bondad ${filtro.valor}`;
          } else {
            eliminadoDesc = `la bondad ${filtro.valor} (no estaba activa)`;
          }
        } else if (filtro.tipo === 'precio') {
          const habia = S.filtros.precioMin || S.filtros.precioMax;
          delete S.filtros.precioMin; delete S.filtros.precioMax;
          eliminadoDesc = habia ? 'el filtro de precio' : 'el filtro de precio (no estaba activo)';
        } else {
          const habia = S.filtros[filtro.tipo];
          delete S.filtros[filtro.tipo];
          eliminadoDesc = habia ? `el filtro de ${filtro.tipo}` : `el filtro de ${filtro.tipo} (no estaba activo)`;
        }

        actualizarUI('Re-buscando sin ese filtro...');
        const resultados = await buscarInmuebles(S.filtros);
        if (!resultados.length) {
          hablar(`Quité ${eliminadoDesc}, pero no encontré inmuebles. Prueba agregando otros filtros o cambiando la búsqueda.`, () => iniciarEscucha());
          return;
        }
        S.resultados = resultados;
        S.cantidadVisible = Math.min(CFG.TAMANO_PAGINA_BROWSE, resultados.length);
        S.indiceFichaEnResultados = -1;
        narrarLote(true, `Quité ${eliminadoDesc}. Ahora tengo ${numeroAPalabrasEspanol(resultados.length)} inmuebles.`);
        return;
      }

      // ---- MOSTRAR MÁS ----
      if (intent === 'MOSTRAR_MAS') {
        if (!S.resultados.length) { hablar('No hay resultados activos. Dime qué buscas primero.', () => iniciarEscucha()); return; }
        if (S.cantidadVisible >= S.resultados.length && !S.browseAbierto) {
          hablar(`Ya estás viendo todas las ${S.resultados.length} opciones. No hay más por mostrar.`, () => iniciarEscucha());
          return;
        }
        cerrarCarrusel();
        if (S.cantidadVisible < CFG.TAMANO_PAGINA_BROWSE) {
          S.cantidadVisible = Math.min(CFG.TAMANO_PAGINA_BROWSE, S.resultados.length);
        }
        renderBrowseModal();
        const visible = Math.min(S.cantidadVisible, S.resultados.length);
        hablar(`Te muestro ${visible} opciones en pantalla. Puedes decir "lee la cinco", "envía la 1 y 5 a mi WhatsApp", o "ver más" para cargar más.`, () => iniciarEscucha());
        return;
      }

      // ---- VOLVER LISTA ----
      if (intent === 'VOLVER_LISTA') {
        if (!S.resultados.length) { hablar('No hay resultados activos. Dime qué buscas.', () => iniciarEscucha()); return; }
        try { if (typeof cerrarModalPropiedad === 'function') cerrarModalPropiedad(); } catch(e) {}
        try { if (typeof cerrarModal === 'function') cerrarModal(); } catch(e) {}
        S.modalPropiedadAbierto = false;
        S.fase = 'SELECCIONANDO';
        narrarLote(false);
        return;
      }

      // ---- SIGUIENTE / ANTERIOR LOTE ----
      if (intent === 'SIGUIENTE_LOTE') {
        if (!S.resultados.length) { hablar('No hay resultados activos.', () => iniciarEscucha()); return; }
        const totalLotes = Math.ceil(S.resultados.length / CFG.TAMANO_LOTE);
        if (S.loteActual + 1 >= totalLotes) {
          hablar(`Ya te mostré todas las ${S.resultados.length} opciones en el carrusel. Puedes decir "ver más" para verlas todas en pantalla.`, () => iniciarEscucha());
          return;
        }
        S.loteActual++;
        renderCarrusel();
        const inicio = S.loteActual * CFG.TAMANO_LOTE;
        const fin = Math.min(inicio + CFG.TAMANO_LOTE, S.resultados.length);
        const lote = S.resultados.slice(inicio, fin);
        let msg = `Lote ${S.loteActual+1}. Del ${inicio+1} al ${fin}. `;
        lote.forEach((p,i) => { msg += `Opción ${inicio+i+1}: ${describirCorto(p)}. `; });
        msg += '¿Cuál deseas leer?';
        S.fase = 'SELECCIONANDO';
        S.indiceFichaEnResultados = -1;
        actualizarUI(`Lote ${S.loteActual+1} · ${fin} de ${S.resultados.length}`);
        hablar(msg, () => { if (S.activo) iniciarEscucha(); }, { rate: CFG.TTS_RATE_PRECIO });
        return;
      }
      if (intent === 'ANTERIOR_LOTE') {
        if (!S.resultados.length) { hablar('No hay resultados.', () => iniciarEscucha()); return; }
        if (S.loteActual === 0) { hablar('Ya estás en el primer lote.', () => iniciarEscucha()); return; }
        S.loteActual--;
        renderCarrusel();
        const inicio = S.loteActual * CFG.TAMANO_LOTE;
        const fin = Math.min(inicio + CFG.TAMANO_LOTE, S.resultados.length);
        const lote = S.resultados.slice(inicio, fin);
        let msg = `Lote ${S.loteActual+1}. Del ${inicio+1} al ${fin}. `;
        lote.forEach((p,i) => { msg += `Opción ${inicio+i+1}: ${describirCorto(p)}. `; });
        msg += '¿Cuál deseas leer?';
        S.fase = 'SELECCIONANDO';
        S.indiceFichaEnResultados = -1;
        actualizarUI(`Lote ${S.loteActual+1} · ${fin} de ${S.resultados.length}`);
        hablar(msg, () => { if (S.activo) iniciarEscucha(); }, { rate: CFG.TTS_RATE_PRECIO });
        return;
      }

      // ---- LEER TODAS ----
      if (intent === 'LEER_TODAS') {
        if (!S.resultados.length) { hablar('No hay resultados.', () => iniciarEscucha()); return; }
        const aLeer = S.resultados.slice(0, Math.min(10, S.resultados.length));
        const txt = aLeer.map((p,i) => `Opción ${i+1}: ${describirCorto(p)}.`).join(' ');
        hablar(`Te leo las primeras ${aLeer.length} opciones. ${txt}`, () => iniciarEscucha(), { rate: CFG.TTS_RATE_PRECIO });
        return;
      }

      // ---- ENVIAR LOTE (hasta 10) ----
      if (intent === 'ENVIAR_LOTE') {
        if (!S.resultados.length) { hablar('No hay resultados para enviar. Dime qué buscas.', () => iniciarEscucha()); return; }
        const aEnviar = S.resultados.slice(0, Math.min(CFG.TAMANO_ENVIO_MAX, S.resultados.length));
        const aviso = aEnviar.length === S.resultados.length
          ? `Voy a enviar las ${aEnviar.length} opciones a tu WhatsApp.`
          : `Voy a enviar las primeras ${aEnviar.length} opciones de ${S.resultados.length}. Si quieres las demás, dime "ver más" y luego "envía todas" de nuevo.`;
        hablar(aviso, () => {
          mostrarModalEnvioWhatsApp(aEnviar, 'mi');
        });
        return;
      }

      // ---- ACCIONES SOBRE OPCIÓN ----
      if (['LEER_FICHA','ABRIR_FICHA','ENVIAR_WHATSAPP','CONTACTAR_AGENTE','ABRIR_Y_CONTACTAR','LEER_SIGUIENTE','LEER_ANTERIOR'].includes(intent)) {
        if (!S.resultados.length) {
          hablar('Primero necesito que busques algo. Dime por ejemplo "casa en venta en Prebo", o simplemente "Prebo".', () => iniciarEscucha());
          return;
        }

        // ENVIAR_WHATSAPP: múltiples números
        if (intent === 'ENVIAR_WHATSAPP') {
          const nums = extraerNumerosMultiples(transcript);
          const validos = nums.filter(n => n >= 1 && n <= S.resultados.length);
          if (validos.length === 0) {
            hablar('No identifiqué números de opción. Puedes decir "envía la uno", "envía la uno y la cinco", o "envía todas".', () => iniciarEscucha());
            return;
          }
          if (validos.length > CFG.TAMANO_ENVIO_MAX) {
            const primeros = validos.slice(0, CFG.TAMANO_ENVIO_MAX);
            hablar(`Voy a enviar las ${CFG.TAMANO_ENVIO_MAX} primeras opciones que pediste. Para las demás, repite el comando después.`, () => {
              mostrarModalEnvioWhatsApp(primeros.map(n => S.resultados[n-1]), 'mi');
            });
            return;
          }
          const items = validos.map(n => S.resultados[n-1]);
          mostrarModalEnvioWhatsApp(items, 'mi');
          return;
        }

        let idx = null;
        if (intent === 'LEER_SIGUIENTE') {
          idx = (S.indiceFichaEnResultados >= 0 && S.indiceFichaEnResultados + 1 < S.resultados.length)
            ? S.indiceFichaEnResultados + 1 : 0;
        } else if (intent === 'LEER_ANTERIOR') {
          idx = (S.indiceFichaEnResultados > 0) ? S.indiceFichaEnResultados - 1 : 0;
        } else {
          const n = extraerNumeroOpcion(transcript);
          if (n && n >= 1 && n <= S.resultados.length) idx = n - 1;
          else if (S.indiceFichaEnResultados >= 0 && S.indiceFichaEnResultados < S.resultados.length) idx = S.indiceFichaEnResultados;
          else idx = null;
        }

        if (idx === null || idx < 0 || idx >= S.resultados.length) {
          hablar('¿Qué número de opción? Puedes decir "la uno", "la dos" o "la tres".', () => iniciarEscucha());
          return;
        }
        const inm = S.resultados[idx];

        if (intent === 'LEER_FICHA' || intent === 'LEER_SIGUIENTE' || intent === 'LEER_ANTERIOR') {
          narrarFicha(inm); return;
        }
        if (intent === 'ABRIR_FICHA') {
          narrarFicha(inm);
          setTimeout(() => abrirFicha(inm), 300);
          return;
        }
        if (intent === 'ABRIR_Y_CONTACTAR') {
          narrarFicha(inm);
          setTimeout(() => abrirFicha(inm), 300);
          setTimeout(() => mostrarModalEnvioWhatsApp([inm], 'agente'), 1200);
          return;
        }
        if (intent === 'CONTACTAR_AGENTE') {
          const n = extraerNumeroOpcion(transcript);
          const target = (n && n >= 1 && n <= S.resultados.length) ? S.resultados[n-1] : inm;
          mostrarModalEnvioWhatsApp([target], 'agente');
          return;
        }
      }

      // ---- FALLBACK: BUSCAR ----
      const nuevos = extraerFiltros(transcript);

      if (Object.keys(nuevos).length === 0) {
        const zona = detectarZonaSuelta(transcript);
        if (zona) {
          nuevos.ubicacion = zona;
          console.log('[Eco] 📍 Zona suelta detectada:', zona);
        }
      }

      const tieneNuevos = Object.keys(nuevos).length > 0;

      if (!tieneNuevos) {
        if (S.resultados.length > 0 && (S.fase === 'SELECCIONANDO' || S.fase === 'LEYENDO_FICHA')) {
          hablar('No entendí ese comando. Puedes decir "leer la uno", "siguiente", "anterior", "enviar la dos a mi WhatsApp", "enviar la 1 y 5 a mi WhatsApp", "contactar al agente", "enviar todas", "ver más", "quitar el filtro de piscina", "volver a la lista", o dime nuevos filtros para añadir. Por ejemplo: "y que tenga tres habitaciones".', () => iniciarEscucha());
        } else {
          hablar('No entendí qué buscar. Puedes decir solo una zona como "Prebo", o combinar filtros: "casa en venta en Prebo hasta cien mil dólares con tres habitaciones". También puedes decir "ayuda" para ver todos los comandos en pantalla.', () => iniciarEscucha());
        }
        return;
      }

      const habiaResultados = S.resultados.length > 0;
      const filtrosAntes = { ...S.filtros };
      S.filtros = Object.assign({}, S.filtros, nuevos);

      actualizarUI(habiaResultados ? 'Añadiendo filtros...' : 'Buscando inmuebles...');
      const resultados = await buscarInmuebles(S.filtros);

      if (!resultados.length) {
        if (habiaResultados) {
          S.filtros = filtrosAntes;
          hablar('Con ese filtro no quedan inmuebles. Vuelvo a la búsqueda anterior. Puedes intentar otro filtro o cambiar de búsqueda.', () => iniciarEscucha());
        } else {
          hablar('No encontré inmuebles con esos criterios. Intenta ampliar la zona o el presupuesto, o dime otra característica.', () => iniciarEscucha());
        }
        return;
      }

      S.resultados = resultados;
      S.loteActual = 0;
      S.indiceFichaEnResultados = -1;
      S.cantidadVisible = Math.min(CFG.TAMANO_PAGINA_BROWSE, resultados.length);

      if (habiaResultados) {
        const desc = describirFiltrosAñadidos(nuevos);
        narrarLote(true, `Añadí ${desc}. Ahora tengo ${numeroAPalabrasEspanol(resultados.length)} inmuebles que coinciden.`);
      } else {
        narrarLote(true);
      }
    } catch (err) {
      console.error('[Eco] Error procesando comando:', err);
      hablar('Tuve un problema procesando tu solicitud. ¿Puedes repetirlo?', () => iniciarEscucha());
    }
  }

  // ══════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ══════════════════════════════════════════════════════════════
  window.iniciarAsistenteVoz = function () {
    if (!S.rec) {
      alert('Tu navegador no soporta reconocimiento de voz. Usa Chrome, Edge o Safari actualizado.');
      return;
    }
    const waModal = document.getElementById('ecoVoiceWaModal');
    if (waModal) waModal.remove();

    if (S.synth && S.synth.speaking) {
      detenerHabla();
      S.activo = true;
      mostrarUI('Te escucho...');
      try { S.rec.abort(); } catch (e) {}
      setTimeout(() => iniciarEscucha(), 150);
      return;
    }

    if (S.activo) {
      mostrarUI('Te escucho...');
      try { S.rec.abort(); } catch (e) {}
      setTimeout(() => iniciarEscucha(), 150);
      return;
    }

    S.activo = true; S.fase = 'IDLE';
    mostrarUI(`${CFG.NOMBRE} te está escuchando...`);
    mostrarPanelAyuda();
    const saludo = `Hola, soy ${CFG.NOMBRE}, ${CFG.ROL}. Te dejé un panel de ayuda en pantalla. Dime solo una zona como "Prebo", o combina: "casa en venta en Prebo hasta cien mil dólares".`;
    hablar(saludo, () => { if (S.activo) iniciarEscucha(); });
  };

  window.detenerAsistenteVoz = function () {
    S.activo = false; S.fase = 'IDLE'; S.modalPropiedadAbierto = false;
    if (S.pollPropiedadId) { clearInterval(S.pollPropiedadId); S.pollPropiedadId = null; }
    detenerHabla(); detenerEscucha(); cerrarCarrusel(); cerrarBrowseModal(); ocultarUI(); ocultarPanelAyuda(); liberarWakeLock();
  };

  window.cerrarModalCarruselVoz = function () { cerrarCarrusel(); };

  // ══════════════════════════════════════════════════════════════
  // VISIBILITY RESUME
  // ══════════════════════════════════════════════════════════════
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && S.activo && !S.micOn && !S.procesando && !S.modalPropiedadAbierto) {
      if (S.fase === 'SELECCIONANDO' || S.fase === 'LEYENDO_FICHA') {
        setTimeout(() => {
          if (S.activo && !S.micOn && !S.procesando && !S.modalPropiedadAbierto) iniciarEscucha();
        }, 300);
      }
    }
  });

  // ══════════════════════════════════════════════════════════════
  // INIT
  // ══════════════════════════════════════════════════════════════
  function init() {
    S.rec = initReconocimiento();
    if (!S.rec) console.warn('[Eco] Reconocimiento de voz NO soportado');
    getDb();
    console.log('[Eco v7] Asistente listo — carrusel 3 + browse 10 + multi-envío + quitar filtros');
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
// ═══ FIN PARTE 3/3 ═══
// FIN DEL ARCHIVO — js/asistente-voz.js
