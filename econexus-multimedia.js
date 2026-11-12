/* =========================================================================
   ECONEXUS · MÓDULO MULTIMEDIA
   Generación de Ficha PDF, Historia IG 9:16, Post IG 3:4,
   Tarjeta de Presentación QR y Reels animados con MediaRecorder.
   ------------------------------------------------------------------------
   Depende de utilidades globales definidas en captacion.html:
   - estado: misInmueblesCargados, fotoPerfilActual, usuarioActual
   - UI: mostrarAvisoElegante, mostrarProgresoGeneracion,
         ocultarProgresoGeneracion, actualizarBarraProgreso
   - colores: obtenerColoresMarcaActivos, esColorClaro,
              oscurecerColorHex, obtenerColorTextoContraste
   - imágenes/QR: urlToBase64, cargarElementoImagen, generarQRDataUrl
   - enlaces: obtenerEnlaceShareInmueble, obtenerEnlaceShareAgente
   - texto: truncarTextoSimple
   - CDN cargados en <head>: pdfMake, html2canvas, QRious
   ========================================================================= */

/* =========================================================
   HELPER: ESPERAR CARGA DE IMAGEN (PARA QR EN HTML2CANVAS)
   ========================================================= */
function esperarImagenCargada(imgEl, timeoutMs = 1800) {
  return new Promise(resolve => {
    if (!imgEl) return resolve();
    if (imgEl.complete && imgEl.naturalWidth > 0) return resolve();
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    imgEl.onload = finish;
    imgEl.onerror = finish;
    setTimeout(finish, timeoutMs);
  });
}

/* =========================================================
   1. GENERADOR FICHA TÉCNICA PDF (CON QR + METADATOS REALES)
   ========================================================= */
async function descargarPDFFormal(id) {
  const p = misInmueblesCargados.find(item => item.id == id);
  if (!p) return mostrarAvisoElegante("Propiedad no encontrada", "Actualiza tus publicaciones e intenta nuevamente.", "error");

  const { primario, secundario } = obtenerColoresMarcaActivos();
  const priPdf = obtenerColorSeguroSobreBlanco(primario, '#1E3F20');
  const secPdf = obtenerColorSeguroSobreBlanco(secundario, '#16a34a');

  mostrarProgresoGeneracion("Generando Ficha PDF...", "Preparando fotografías, QR y formato corporativo de alta resolución.");

  try {
    const fotos = p.fotos || [];
    const fotosBase64 = await Promise.all(fotos.slice(0, 5).map(u => urlToBase64(u)));
    const fotoPrincipal = fotosBase64[0] || null;
    const fotosMosaico = fotosBase64.slice(1, 5).filter(f => f !== null);
    const fotoAgenteBase64 = fotoPerfilActual ? await urlToBase64(fotoPerfilActual) : null;

    /* QR hacia la ficha pública del Worker */
    const urlShare = obtenerEnlaceShareInmueble(p.codigo_eco);
    const qrBase64 = generarQRDataUrl(urlShare, 200, '#0f172a', '#ffffff');

    /* Cabecera con 3 columnas (foto, info, operación+código+QR) */
    const columnasCabecera = [];
    if (fotoAgenteBase64) {
      columnasCabecera.push({ width: 58, image: fotoAgenteBase64, fit: [50, 50], alignment: 'left' });
    }

    columnasCabecera.push({
      width: '*',
      margin: [fotoAgenteBase64 ? 6 : 0, 2, 0, 0],
      stack: [
        { text: `${p.nombre_asesor || 'Asesor Inmobiliario'}`, fontSize: 13, bold: true, color: priPdf, margin: [0, 0, 0, 2] },
        { text: `${p.tipo_asesor === 'Agencia' ? (p.nombre_agencia || 'Agencia Inmobiliaria') : 'Agente Independiente'}`, fontSize: 9, color: '#475569', margin: [0, 0, 0, 2] },
        { text: `WhatsApp: ${p.telefono_asesor || ''}`, fontSize: 9.5, color: secPdf, bold: true }
      ]
    });

    columnasCabecera.push({
      width: 'auto',
      margin: [0, 4, 0, 0],
      stack: [
        { text: `${(p.operacion || 'VENTA').toUpperCase()}`, fontSize: 14, bold: true, color: p.operacion === 'Alquiler' ? '#d97706' : secPdf, alignment: 'right', margin: [0, 0, 0, 2] },
        { text: `CÓDIGO: ${p.codigo_eco}`, fontSize: 9, color: '#64748b', alignment: 'right', bold: true },
        qrBase64 ? { image: qrBase64, width: 52, alignment: 'right', margin: [0, 6, 0, 0] } : { text: '' },
        { text: 'ESCANEA', fontSize: 6, color: '#64748b', alignment: 'right', bold: true, margin: [0, 1, 0, 0] }
      ]
    });

    const docDefinition = {
      pageSize: 'LETTER',
      pageMargins: [35, 30, 35, 42],
      info: {
        title: `Ficha ${p.codigo_eco} - ${p.titulo}`,
        author: p.nombre_asesor || 'Asesor EcoNexus',
        subject: `${p.operacion} en ${p.ubicacion} - $${Number(p.precio).toLocaleString('en-US')}`,
        keywords: `${p.tipo}, ${p.operacion}, ${p.ubicacion}, ${p.codigo_eco}, EcoNexus, Ficha Técnica`,
        creator: 'EcoNexus Platform - econexusplatform.com/menu'
      },
      footer: function() {
        return {
          columns: [
            { text: `Ficha PDF emitida por: ${p.nombre_asesor || 'Asesor EcoNexus'}`, fontSize: 8, color: '#64748b', margin: [35, 0, 0, 0] },
            { text: 'Ficha generada a través de econexusplatform.com/menu', fontSize: 8.5, color: priPdf, alignment: 'right', margin: [0, 0, 35, 0], bold: true }
          ]
        };
      },
      content: [
        { columns: columnasCabecera, columnGap: 10 },
        { canvas: [{ type: 'line', x1: 0, y1: 10, x2: 542, y2: 10, lineWidth: 1.5, lineColor: priPdf }], margin: [0, 0, 0, 12] },
        fotoPrincipal ? { image: fotoPrincipal, width: 542, height: 210, margin: [0, 0, 0, 4] } : {},
        fotosMosaico.length > 0 ? {
          columns: fotosMosaico.map(img => ({ image: img, width: (530 / fotosMosaico.length), height: 70 })),
          columnGap: 4,
          margin: [0, 0, 0, 12]
        } : {},
        {
          columns: [
            { text: p.titulo, fontSize: 13, bold: true, color: '#0f172a', width: '*' },
            { text: `$${Number(p.precio).toLocaleString('en-US')}`, fontSize: 16, bold: true, color: priPdf, alignment: 'right', width: 'auto' }
          ],
          margin: [0, 0, 0, 4]
        },
        { text: `Ubicación: ${p.ubicacion}`, fontSize: 9.5, color: '#475569', margin: [0, 0, 0, 10] },
        {
          table: {
            widths: ['*', '*', '*', '*'],
            body: [
              [
                { text: 'Habitaciones', style: 'tableHeader' },
                { text: 'Baños', style: 'tableHeader' },
                { text: 'Estacionamiento', style: 'tableHeader' },
                { text: 'Área', style: 'tableHeader' }
              ],
              [
                { text: `${p.habitaciones || 0}`, alignment: 'center', fontSize: 9.5, bold: true },
                { text: `${p.banos || 0}`, alignment: 'center', fontSize: 9.5, bold: true },
                { text: `${p.estacionamientos || 0}`, alignment: 'center', fontSize: 9.5, bold: true },
                { text: `${p.metros || 0} m²`, alignment: 'center', fontSize: 9.5, bold: true }
              ]
            ]
          },
          layout: { fillColor: () => '#f8fafc', hLineWidth: () => 0.5, vLineWidth: () => 0, hLineColor: () => '#cbd5e1' },
          margin: [0, 0, 0, 12]
        },
        { text: 'Descripción del Inmueble:', fontSize: 10, bold: true, color: priPdf, margin: [0, 0, 0, 4] },
        { text: p.descripcion || 'Sin descripción.', fontSize: 8.5, color: '#334155', leading: 1.25 }
      ],
      styles: { tableHeader: { bold: true, fontSize: 8, color: priPdf, alignment: 'center' } }
    };

    pdfMake.createPdf(docDefinition).download(`Ficha_${p.codigo_eco}.pdf`);
    ocultarProgresoGeneracion();
  } catch (e) {
    console.error(e);
    ocultarProgresoGeneracion();
    mostrarAvisoElegante("Error en PDF", "No se pudo generar el documento PDF en este momento.", "error");
  }
}

/* =========================================================
   2. GENERADOR HISTORIA IG (1080x1920 - 9:16 CON QR)
   ========================================================= */
async function descargarHistoriaCanvas(id) {
  const p = misInmueblesCargados.find(item => item.id == id);
  if (!p) return mostrarAvisoElegante("Propiedad no encontrada", "Actualiza tus publicaciones e intenta nuevamente.", "error");

  const { primario, secundario } = obtenerColoresMarcaActivos();
  const esPrimarioClaro = esColorClaro(primario);
  const fondoTop = esPrimarioClaro ? '#f8fafc' : primario;
  const fondoBottom = esPrimarioClaro ? '#cbd5e1' : oscurecerColorHex(primario, 55);
  const txtFirma = esPrimarioClaro ? '#0f172a' : '#ffffff';

  mostrarProgresoGeneracion("Creando Historia IG (9:16)...", "Sincronizando colores corporativos, contraste inteligente, fotografías y QR.");

  try {
    const container = document.getElementById('story-canvas-template');
    container.style.background = `linear-gradient(165deg, ${fondoTop} 0%, ${fondoBottom} 100%)`;

    /* 1) QR PRIMERO */
    const urlShare = obtenerEnlaceShareInmueble(p.codigo_eco);
    const qrDataUrl = generarQRDataUrl(urlShare, 300, '#0f172a', '#ffffff');
    const qrImgEl = document.getElementById('story-qr-img');
    if (qrImgEl && qrDataUrl) {
      qrImgEl.src = qrDataUrl;
      await esperarImagenCargada(qrImgEl);
    }

    /* 2) Fotos del mosaico */
    const fotos = (p.fotos && p.fotos.length > 0) ? p.fotos : ["https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=800&q=80"];
    const urlsMosaico = [fotos[0], fotos[1] || fotos[0], fotos[2] || fotos[0], fotos[3] || fotos[1] || fotos[0]];
    const [b64_1, b64_2, b64_3, b64_4, b64Avatar] = await Promise.all([
      urlToBase64(urlsMosaico[0]),
      urlToBase64(urlsMosaico[1]),
      urlToBase64(urlsMosaico[2]),
      urlToBase64(urlsMosaico[3]),
      fotoPerfilActual ? urlToBase64(fotoPerfilActual) : Promise.resolve(null)
    ]);

    document.getElementById('story-img-1').src = b64_1 || urlsMosaico[0];
    document.getElementById('story-img-2').src = b64_2 || urlsMosaico[1];
    document.getElementById('story-img-3').src = b64_3 || urlsMosaico[2];
    document.getElementById('story-img-4').src = b64_4 || urlsMosaico[3];

    /* 3) Avatar */
    const imgAgente = document.getElementById('story-agente-foto');
    if (b64Avatar || fotoPerfilActual) {
      imgAgente.src = b64Avatar || fotoPerfilActual;
      imgAgente.style.borderColor = secundario;
      imgAgente.style.display = 'block';
    } else {
      imgAgente.style.display = 'none';
    }

    /* 4) Datos */
    const esAgencia = p.tipo_asesor === 'Agencia' && p.nombre_agencia;
    document.getElementById('story-agencia-badge').textContent = truncarTextoSimple(esAgencia ? p.nombre_agencia : 'ASESOR INMOBILIARIO', 34);
    document.getElementById('story-agente').textContent = truncarTextoSimple(p.nombre_asesor || "Asesor Inmobiliario", 26);
    document.getElementById('story-telefono').textContent = `WhatsApp: ${p.telefono_asesor || ''}`;

    const bgOperacion = p.operacion === 'Alquiler' ? '#d97706' : secundario;
    const badge = document.getElementById('story-badge-operacion');
    badge.textContent = p.operacion || 'VENTA';
    badge.style.background = bgOperacion;
    badge.style.color = obtenerColorTextoContraste(bgOperacion);

    const ctaBar = document.getElementById('story-cta-bar');
    ctaBar.style.background = secundario;
    ctaBar.style.color = obtenerColorTextoContraste(secundario);

    const footerSig = document.getElementById('story-footer-signature');
    if (footerSig) footerSig.style.color = txtFirma;

    document.getElementById('story-precio').textContent = `$${Number(p.precio).toLocaleString('en-US')}`;
    document.getElementById('story-titulo').textContent = truncarTextoSimple(p.titulo, 52);
    document.getElementById('story-ubicacion').textContent = `📍 ${truncarTextoSimple(p.ubicacion, 36)} • ID: ${p.codigo_eco}`;
    document.getElementById('story-specs').textContent = `${p.habitaciones || 0} Hab | ${p.banos || 0} Baños | ${p.metros || 0}m²`;

    await new Promise(r => setTimeout(r, 250));

    const canvas = await html2canvas(container, {
      useCORS: true, scale: 1, width: 1080, height: 1920, backgroundColor: null, logging: false
    });

    const link = document.createElement('a');
    link.download = `Historia_IG_${p.codigo_eco}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();

    ocultarProgresoGeneracion();
  } catch (e) {
    console.error(e);
    ocultarProgresoGeneracion();
    mostrarAvisoElegante("Error al generar Historia", "Ocurrió un inconveniente procesando la imagen.", "error");
  }
}

/* =========================================================
   3. GENERADOR POST IG 3:4 (1080x1440 CON QR)
   ========================================================= */
async function descargarPostInstagramCanvas(id) {
  const p = misInmueblesCargados.find(item => item.id == id);
  if (!p) return mostrarAvisoElegante("Propiedad no encontrada", "Actualiza tus publicaciones e intenta nuevamente.", "error");

  const { primario, secundario } = obtenerColoresMarcaActivos();
  const esPrimarioClaro = esColorClaro(primario);
  const fondoTop = esPrimarioClaro ? '#f8fafc' : primario;
  const fondoBottom = esPrimarioClaro ? '#cbd5e1' : oscurecerColorHex(primario, 55);
  const txtFirma = esPrimarioClaro ? '#0f172a' : '#ffffff';

  mostrarProgresoGeneracion("Creando Post IG (1080x1440)...", "Renderizando formato vertical 3:4 con contraste inteligente y QR.");

  try {
    const container = document.getElementById('post-canvas-template');
    container.style.background = `linear-gradient(165deg, ${fondoTop} 0%, ${fondoBottom} 100%)`;

    /* 1) QR primero */
    const urlShare = obtenerEnlaceShareInmueble(p.codigo_eco);
    const qrDataUrl = generarQRDataUrl(urlShare, 240, '#0f172a', '#ffffff');
    const qrImgEl = document.getElementById('post-qr-img');
    if (qrImgEl && qrDataUrl) {
      qrImgEl.src = qrDataUrl;
      await esperarImagenCargada(qrImgEl);
    }

    /* 2) Fotos */
    const fotos = (p.fotos && p.fotos.length > 0) ? p.fotos : ["https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=800&q=80"];
    const urlsPost = [fotos[0], fotos[1] || fotos[0], fotos[2] || fotos[0], fotos[3] || fotos[1] || fotos[0]];
    const [b64_1, b64_2, b64_3, b64_4, b64Avatar] = await Promise.all([
      urlToBase64(urlsPost[0]),
      urlToBase64(urlsPost[1]),
      urlToBase64(urlsPost[2]),
      urlToBase64(urlsPost[3]),
      fotoPerfilActual ? urlToBase64(fotoPerfilActual) : Promise.resolve(null)
    ]);

    document.getElementById('post-img-1').src = b64_1 || urlsPost[0];
    document.getElementById('post-img-2').src = b64_2 || urlsPost[1];
    document.getElementById('post-img-3').src = b64_3 || urlsPost[2];
    document.getElementById('post-img-4').src = b64_4 || urlsPost[3];

    /* 3) Avatar */
    const imgAgente = document.getElementById('post-agente-foto');
    if (b64Avatar || fotoPerfilActual) {
      imgAgente.src = b64Avatar || fotoPerfilActual;
      imgAgente.style.borderColor = secundario;
      imgAgente.style.display = 'block';
    } else {
      imgAgente.style.display = 'none';
    }

    /* 4) Datos */
    const esAgencia = p.tipo_asesor === 'Agencia' && p.nombre_agencia;
    document.getElementById('post-agencia-badge').textContent = truncarTextoSimple(esAgencia ? p.nombre_agencia : 'ASESOR INMOBILIARIO', 34);
    document.getElementById('post-agente').textContent = truncarTextoSimple(p.nombre_asesor || "Asesor Inmobiliario", 26);
    document.getElementById('post-telefono').textContent = `WhatsApp: ${p.telefono_asesor || ''}`;

    const bgOperacion = p.operacion === 'Alquiler' ? '#d97706' : secundario;
    const badge = document.getElementById('post-badge-operacion');
    badge.textContent = p.operacion || 'VENTA';
    badge.style.background = bgOperacion;
    badge.style.color = obtenerColorTextoContraste(bgOperacion);

    const codPill = document.getElementById('post-codigo-pill');
    codPill.textContent = `CÓDIGO: ${p.codigo_eco}`;
    codPill.style.background = secundario;
    codPill.style.color = obtenerColorTextoContraste(secundario);

    const footerSig = document.getElementById('post-footer-signature');
    if (footerSig) footerSig.style.color = txtFirma;

    document.getElementById('post-precio').textContent = `$${Number(p.precio).toLocaleString('en-US')}`;
    document.getElementById('post-titulo').textContent = truncarTextoSimple(p.titulo, 46);
    document.getElementById('post-ubicacion').textContent = `📍 ${truncarTextoSimple(p.tipo + ' en ' + p.ubicacion, 50)}`;
    document.getElementById('post-specs').textContent = `${p.habitaciones || 0} Hab | ${p.banos || 0} Baños | ${p.metros || 0}m²`;

    await new Promise(r => setTimeout(r, 250));

    const canvas = await html2canvas(container, {
      useCORS: true, scale: 1, width: 1080, height: 1440, backgroundColor: null, logging: false
    });

    const link = document.createElement('a');
    link.download = `Post_IG_3x4_${p.codigo_eco}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();

    ocultarProgresoGeneracion();
  } catch (e) {
    console.error(e);
    ocultarProgresoGeneracion();
    mostrarAvisoElegante("Error al generar Post 3:4", "No se pudo exportar el Post de Instagram.", "error");
  }
}

/* =========================================================
   4. MI TARJETA DE PRESENTACIÓN (1080x1920) CON QR AL PORTAFOLIO
   ========================================================= */
async function descargarTarjetaPresentacionCanvas() {
  const nombre = document.getElementById('perfilNombreAgente').value.trim() || document.getElementById('headerDisplayNombreAgente').textContent || 'Asesor Inmobiliario';
  const telefono = document.getElementById('perfilTelefono').value.trim() || 'Disponible';
  const tipo = document.getElementById('perfilTipoAsesor').value || 'Independiente';
  const agencia = document.getElementById('perfilNombreAgencia').value.trim();
  const sobreMi = document.getElementById('perfilSobreMi').value.trim() || 'Especialista en comercialización de inmuebles residenciales, comerciales e industriales. Atención personalizada, respaldo profesional y contacto directo.';

  const { primario, secundario } = obtenerColoresMarcaActivos();
  const esPrimarioClaro = esColorClaro(primario);
  const fondoTop = esPrimarioClaro ? '#1e293b' : primario;
  const fondoBottom = esPrimarioClaro ? '#0f172a' : oscurecerColorHex(primario, 58);

  mostrarProgresoGeneracion("Creando Mi Tarjeta para Estados...", "Aplicando datos, colores, QR y contraste inteligente en 1080x1920 px.");

  try {
    const container = document.getElementById('card-presentacion-template');
    container.style.background = `linear-gradient(165deg, ${fondoTop} 0%, ${fondoBottom} 100%)`;

    document.getElementById('card-pres-avatar-ring').style.background = `linear-gradient(135deg, #fde047, ${secundario})`;
    const tipoBadge = document.getElementById('card-pres-tipo-badge');
    tipoBadge.style.background = secundario;
    tipoBadge.style.color = obtenerColorTextoContraste(secundario);
    tipoBadge.textContent = tipo === 'Agencia' ? 'AGENCIA INMOBILIARIA' : 'AGENTE INDEPENDIENTE';

    /* 1) QR al portafolio del agente (Worker /share?u=userId) */
    const urlPortafolio = obtenerEnlaceShareAgente(usuarioActual?.id);
    const qrDataUrl = generarQRDataUrl(urlPortafolio, 260, '#0f172a', '#ffffff');
    const qrImgEl = document.getElementById('card-pres-qr-img');
    if (qrImgEl && qrDataUrl) {
      qrImgEl.src = qrDataUrl;
      await esperarImagenCargada(qrImgEl);
    }

    /* 2) Avatar */
    const avatarUrl = fotoPerfilActual || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png';
    const avatarB64 = await urlToBase64(avatarUrl);
    document.getElementById('card-pres-foto').src = avatarB64 || avatarUrl;

    /* 3) Datos */
    document.getElementById('card-pres-nombre').textContent = truncarTextoSimple(nombre, 26);
    document.getElementById('card-pres-agencia').textContent = truncarTextoSimple((tipo === 'Agencia' && agencia) ? `Agencia: ${agencia}` : 'Portafolio Oficial Verificado en EcoNexus', 42);
    document.getElementById('card-pres-sobremi').textContent = `"${truncarTextoSimple(sobreMi, 220)}"`;
    document.getElementById('card-pres-telefono').textContent = telefono;

    const waBox = document.getElementById('card-pres-wa-box');
    waBox.style.background = secundario;
    waBox.style.color = obtenerColorTextoContraste(secundario);

    await new Promise(r => setTimeout(r, 250));

    const canvas = await html2canvas(container, {
      useCORS: true, scale: 1, width: 1080, height: 1920, backgroundColor: null, logging: false
    });

    const link = document.createElement('a');
    link.download = `Mi_Tarjeta_Presentacion_${nombre.replace(/\s+/g, '_')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();

    ocultarProgresoGeneracion();
  } catch (e) {
    console.error(e);
    ocultarProgresoGeneracion();
    mostrarAvisoElegante("Error al crear Tarjeta", "No se pudo generar tu tarjeta de presentación para estados.", "error");
  }
}

/* =========================================================
   HELPERS DE DIBUJO EN CANVAS
   ========================================================= */
function dibujarRectanguloRedondeado(ctx, x, y, width, height, radius, fillColor, strokeColor = null, lineWidth = 2) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  if (fillColor) { ctx.fillStyle = fillColor; ctx.fill(); }
  if (strokeColor) { ctx.lineWidth = lineWidth; ctx.strokeStyle = strokeColor; ctx.stroke(); }
  ctx.restore();
}

function truncarTextoCanvas(ctx, texto, maxWidth) {
  if (!texto) return '';
  if (ctx.measureText(texto).width <= maxWidth) return texto;
  let recorte = texto;
  while (recorte.length > 0 && ctx.measureText(recorte + '...').width > maxWidth) {
    recorte = recorte.slice(0, -1);
  }
  return recorte + '...';
}

/* =========================================================
   5. MOTOR DE REELS ANIMADOS (1080x1920 @ 30fps CON QR)
   ========================================================= */
async function generarReelAnimadoInmueble(id, fotosElegidas = null) {
  const p = misInmueblesCargados.find(item => item.id == id);
  if (!p) return mostrarAvisoElegante("Propiedad no encontrada", "Actualiza tus publicaciones e intenta nuevamente.", "error");

  if (typeof MediaRecorder === 'undefined') {
    return mostrarAvisoElegante("Navegador no compatible", "Tu navegador actual no soporta grabación nativa de video HTML5. Utiliza Chrome, Edge o Safari actualizado.", "info");
  }

  let fotosUrls;
  if (Array.isArray(fotosElegidas) && fotosElegidas.length > 0) {
    fotosUrls = fotosElegidas.slice(0, 4);
  } else if (p.fotos && p.fotos.length > 0) {
    fotosUrls = p.fotos.slice(0, 4);
  } else {
    fotosUrls = ["https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=800&q=80"];
  }

  const { primario, secundario } = obtenerColoresMarcaActivos();
  const esPrimarioClaro = esColorClaro(primario);
  const bgTopReel = esPrimarioClaro ? '#1e293b' : primario;
  const bgBottomReel = esPrimarioClaro ? '#0f172a' : oscurecerColorHex(primario, 60);

  const colorBotonOp = p.operacion === 'Alquiler' ? '#d97706' : secundario;
  const colorTextoOp = obtenerColorTextoContraste(colorBotonOp);
  const colorTextoCta = obtenerColorTextoContraste(secundario);

  mostrarProgresoGeneracion("Produciendo Video Reel...", "Cargando fotografías en alta definición y preparando animación con QR...", true);

  try {
    /* 1) Cargar fotos */
    const fotosB64 = await Promise.all(fotosUrls.map(u => urlToBase64(u)));
    const imgsCargadas = (await Promise.all(fotosB64.map((b, i) => cargarElementoImagen(b || fotosUrls[i])))).filter(Boolean);

    if (imgsCargadas.length === 0) {
      ocultarProgresoGeneracion();
      return mostrarAvisoElegante("Sin imágenes válidas", "No se pudieron procesar las fotos para el Reel.", "error");
    }

    /* 2) Cargar avatar */
    const avatarB64 = fotoPerfilActual ? await urlToBase64(fotoPerfilActual) : null;
    const imgAvatar = avatarB64 ? await cargarElementoImagen(avatarB64) : null;

    /* 3) QR hacia ficha pública */
    const urlShare = obtenerEnlaceShareInmueble(p.codigo_eco);
    const qrDataUrl = generarQRDataUrl(urlShare, 400, '#0f172a', '#ffffff');
    const imgQR = qrDataUrl ? await cargarElementoImagen(qrDataUrl) : null;

    /* 4) Canvas y MediaRecorder */
    const canvas = document.getElementById('reel-canvas-render');
    const ctx = canvas.getContext('2d');
    const mimeTypes = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    let mimeElegido = '';

    for (const m of mimeTypes) {
      if (MediaRecorder.isTypeSupported(m)) { mimeElegido = m; break; }
    }

    const stream = canvas.captureStream(30);
    const recorder = mimeElegido ? new MediaRecorder(stream, { mimeType: mimeElegido, videoBitsPerSecond: 6000000 }) : new MediaRecorder(stream);
    const chunks = [];

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    const grabacionPromesa = new Promise((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeElegido || 'video/webm' });
        const ext = (mimeElegido && mimeElegido.includes('mp4')) ? 'mp4' : 'webm';
        const urlVideo = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = urlVideo;
        a.download = `Reel_${p.codigo_eco}.${ext}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(urlVideo), 8000);
        resolve();
      };
    });

    recorder.start();

    const FPS = 30;
    const segundosPorSlide = 2.2;
    const secuencias = imgsCargadas.length === 1 ? [imgsCargadas[0], imgsCargadas[0], imgsCargadas[0]] : imgsCargadas;
    const totalFrames = Math.round(secuencias.length * segundosPorSlide * FPS);
    const framesPorSlide = Math.round(segundosPorSlide * FPS);
    const esAgencia = p.tipo_asesor === 'Agencia' && p.nombre_agencia;
    const subtituloAsesor = esAgencia ? p.nombre_agencia : 'ASESOR INMOBILIARIO';

    for (let frame = 0; frame < totalFrames; frame++) {
      const slideIdx = Math.min(secuencias.length - 1, Math.floor(frame / framesPorSlide));
      const frameEnSlide = frame % framesPorSlide;
      const progresoSlide = frameEnSlide / framesPorSlide;
      const imgActual = secuencias[slideIdx];

      /* 5.1 Fondo degradado corporativo */
      const gradBg = ctx.createLinearGradient(0, 0, 1080, 1920);
      gradBg.addColorStop(0, bgTopReel);
      gradBg.addColorStop(1, bgBottomReel);
      ctx.fillStyle = gradBg;
      ctx.fillRect(0, 0, 1080, 1920);

      /* 5.2 Marco central con Ken Burns */
      const areaX = 54, areaY = 250, areaW = 972, areaH = 1040;
      ctx.save();
      dibujarRectanguloRedondeado(ctx, areaX, areaY, areaW, areaH, 36, '#0f172a');
      ctx.clip();

      if (imgActual) {
        const escalaZoom = 1.0 + (progresoSlide * 0.14);
        const imgRatio = imgActual.width / imgActual.height;
        const boxRatio = areaW / areaH;
        let drawW, drawH;

        if (imgRatio > boxRatio) {
          drawH = areaH * escalaZoom;
          drawW = drawH * imgRatio;
        } else {
          drawW = areaW * escalaZoom;
          drawH = drawW / imgRatio;
        }

        const dirPan = (slideIdx % 2 === 0) ? 1 : -1;
        const offsetX = areaX + (areaW - drawW) / 2 + (dirPan * (progresoSlide - 0.5) * 35);
        const offsetY = areaY + (areaH - drawH) / 2;

        ctx.drawImage(imgActual, offsetX, offsetY, drawW, drawH);

        const gradFoto = ctx.createLinearGradient(0, areaY + areaH - 260, 0, areaY + areaH);
        gradFoto.addColorStop(0, 'rgba(0,0,0,0)');
        gradFoto.addColorStop(1, 'rgba(0,0,0,0.75)');
        ctx.fillStyle = gradFoto;
        ctx.fillRect(areaX, areaY, areaW, areaH);
      }

      ctx.restore();
      dibujarRectanguloRedondeado(ctx, areaX, areaY, areaW, areaH, 36, null, 'rgba(255,255,255,0.28)', 3);

      /* 5.3 QR flotante sobre la imagen */
      if (imgQR) {
        const qrBoxSize = 200;
        const qrBoxX = areaX + areaW - qrBoxSize - 18;
        const qrBoxY = areaY + areaH - qrBoxSize - 18;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.45)';
        ctx.shadowBlur = 20;
        ctx.shadowOffsetY = 6;
        dibujarRectanguloRedondeado(ctx, qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 22, '#ffffff', 'rgba(255,255,255,0.9)', 3);
        ctx.restore();

        const qrInner = qrBoxSize - 28;
        ctx.drawImage(imgQR, qrBoxX + 14, qrBoxY + 14, qrInner, qrInner);
        ctx.fillStyle = '#0f172a';
        ctx.font = '900 15px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('ESCANEA', qrBoxX + qrBoxSize / 2, qrBoxY + qrBoxSize - 4);
        ctx.textAlign = 'left';
      }

      /* 5.4 Indicadores de slide */
      const dotWidth = 90;
      const totalDotsW = secuencias.length * dotWidth + (secuencias.length - 1) * 12;
      let startDotX = (1080 - totalDotsW) / 2;
      for (let d = 0; d < secuencias.length; d++) {
        dibujarRectanguloRedondeado(ctx, startDotX + d * (dotWidth + 12), areaY + 24, dotWidth, 10, 5, d === slideIdx ? '#fde047' : 'rgba(255,255,255,0.35)');
      }

      /* 5.5 Cabecera superior */
      dibujarRectanguloRedondeado(ctx, 54, 52, 972, 165, 28, 'rgba(15, 23, 42, 0.5)', 'rgba(255,255,255,0.24)', 2);
      let textStartX = 86;

      if (imgAvatar) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(134, 134, 54, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(imgAvatar, 80, 80, 108, 108);
        ctx.restore();

        ctx.beginPath();
        ctx.arc(134, 134, 54, 0, Math.PI * 2);
        ctx.lineWidth = 4;
        ctx.strokeStyle = secundario;
        ctx.stroke();
        textStartX = 210;
      }

      ctx.fillStyle = '#a7f3d0';
      ctx.font = '800 20px "Segoe UI", sans-serif';
      ctx.fillText(truncarTextoCanvas(ctx, subtituloAsesor.toUpperCase(), 500), textStartX, 102);

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 34px "Segoe UI", sans-serif';
      ctx.fillText(truncarTextoCanvas(ctx, p.nombre_asesor || 'Asesor EcoNexus', 500), textStartX, 142);

      ctx.fillStyle = '#fde047';
      ctx.font = '700 24px "Segoe UI", sans-serif';
      ctx.fillText(`WhatsApp: ${p.telefono_asesor || ''}`, textStartX, 178);

      const opTexto = (p.operacion || 'VENTA').toUpperCase();
      dibujarRectanguloRedondeado(ctx, 765, 96, 230, 76, 38, colorBotonOp);
      ctx.fillStyle = colorTextoOp;
      ctx.font = '900 27px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(opTexto, 880, 144);
      ctx.textAlign = 'left';

      /* 5.6 Tarjeta inferior */
      dibujarRectanguloRedondeado(ctx, 54, 1325, 972, 380, 32, 'rgba(15, 23, 42, 0.55)', 'rgba(255,255,255,0.24)', 2);

      ctx.fillStyle = '#4ade80';
      ctx.font = '900 64px "Segoe UI", sans-serif';
      ctx.fillText(`$${Number(p.precio).toLocaleString('en-US')}`, 90, 1412);

      dibujarRectanguloRedondeado(ctx, 500, 1356, 490, 72, 20, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 24px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${p.habitaciones || 0} Hab | ${p.banos || 0} Baños | ${p.metros || 0}m²`, 745, 1401);
      ctx.textAlign = 'left';

      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(90, 1445);
      ctx.lineTo(990, 1445);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = '800 35px "Segoe UI", sans-serif';
      ctx.fillText(truncarTextoCanvas(ctx, p.titulo, 900), 90, 1505);

      ctx.fillStyle = '#fde047';
      ctx.font = '700 27px "Segoe UI", sans-serif';
      ctx.fillText(truncarTextoCanvas(ctx, `${p.tipo} en ${p.ubicacion} • ID: ${p.codigo_eco}`, 900), 90, 1558);

      /* 5.7 CTA */
      dibujarRectanguloRedondeado(ctx, 90, 1595, 900, 78, 39, secundario);
      ctx.fillStyle = colorTextoCta;
      ctx.font = '900 26px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Contáctame al WhatsApp o escanea el QR', 540, 1644);

      /* 5.8 Pie de firma */
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 23px "Segoe UI", sans-serif';
      ctx.fillText('Ficha generada a través de econexusplatform.com/menu', 540, 1855);
      ctx.textAlign = 'left';

      /* 5.9 Progreso */
      if (frame % 5 === 0) {
        const pct = Math.round((frame / totalFrames) * 100);
        actualizarBarraProgreso(pct, `Renderizando fotogramas de alta definición (${pct}%)...`);
      }

      await new Promise(r => setTimeout(r, 1000 / FPS));
    }

    actualizarBarraProgreso(100, "Empaquetando archivo de video...");
    recorder.stop();
    await grabacionPromesa;

    ocultarProgresoGeneracion();
    mostrarAvisoElegante("¡Video Reel Creado con Éxito!", "Tu Reel animado con QR inteligente ya se descargó en tu dispositivo, listo para Instagram, TikTok o Estados.");
  } catch (err) {
    console.error("Error generando Reel:", err);
    ocultarProgresoGeneracion();
    mostrarAvisoElegante("Error al generar Reel", "No se pudo completar la animación de video en este dispositivo.", "error");
  }
}
