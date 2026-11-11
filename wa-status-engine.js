/**
 * ═══════════════════════════════════════════════════════════════════════
 * MOTOR DE ESTADOS DE WHATSAPP (BENTO-STORY & RÁFAGA CONECTADA)
 * Archivo: wa-status-engine.js
 * 100% Vanilla JS — Sin dependencias externas
 * ═══════════════════════════════════════════════════════════════════════
 * 4 ajustes aprobados:
 *   ✅ Ajuste 1: User Activation (video espera segundo toque)
 *   ✅ Ajuste 2: QR nítido (imageSmoothingEnabled = false)
 *   ✅ Ajuste 3: Detección móvil vs desktop (fallback descarga)
 *   ✅ Ajuste 4: Bitrate 6.5 Mbps para nitidez de textos
 * ═══════════════════════════════════════════════════════════════════════
 */

const WAStatusEngine = (() => {
  const WIDTH = 1080;
  const HEIGHT = 1920;

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      const sep = url.includes("?") ? "&" : "?";
      img.src = `${url}${sep}t=${Date.now()}`;
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`No se pudo cargar la imagen: ${url}`));
    });
  }

  function drawImageCover(ctx, img, x, y, w, h, offsetX = 0) {
    const imgRatio = img.width / img.height;
    const winRatio = w / h;
    let renderW, renderH, cropX, cropY;

    if (imgRatio > winRatio) {
      renderH = img.height;
      renderW = img.height * winRatio;
      cropX = (img.width - renderW) / 2;
      cropY = 0;
    } else {
      renderW = img.width;
      renderH = img.width / winRatio;
      cropX = 0;
      cropY = (img.height - renderH) / 2;
    }

    ctx.drawImage(img, cropX, cropY, renderW, renderH, x + offsetX, y, w, h);
  }

  function roundRect(ctx, x, y, w, h, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function wrapText(ctx, text, maxWidth, maxLines = 2) {
    if (!text) return [];
    const words = String(text).split(/\s+/);
    const lines = [];
    let current = '';

    for (const word of words) {
      const test = current ? current + ' ' + word : word;
      if (ctx.measureText(test).width <= maxWidth) {
        current = test;
      } else {
        if (current) {
          lines.push(current);
          if (lines.length >= maxLines) {
            let last = lines[lines.length - 1];
            while (ctx.measureText(last + '...').width > maxWidth && last.length > 0) {
              last = last.slice(0, -1);
            }
            lines[lines.length - 1] = last + '...';
            return lines;
          }
          current = word;
        } else {
          lines.push(word.substring(0, 30) + '...');
          return lines;
        }
      }
    }

    if (current && lines.length < maxLines) {
      lines.push(current);
    }
    return lines;
  }

  function renderBentoFrame(ctx, data, images, state) {
    const { currentIndex, nextIndex, progress, mode, slideNumber, totalSlides } = state;
    const currentImg = images[currentIndex];
    const nextImg = images[nextIndex] || images[0];

    const COLOR_BG = '#f8fafc';
    const COLOR_WHITE = '#ffffff';
    const COLOR_TEXT = '#0f172a';
    const COLOR_TEXT_MUTED = '#475569';
    const COLOR_GREEN = '#10b981';
    const COLOR_GREEN_SOFT = '#ecfdf5';
    const COLOR_GREEN_BORDER = '#a7f3d0';

    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const gradHeader = ctx.createLinearGradient(0, 0, WIDTH, 0);
    gradHeader.addColorStop(0, '#1E3F20');
    gradHeader.addColorStop(1, '#2E5E32');
    ctx.fillStyle = gradHeader;
    ctx.fillRect(0, 0, WIDTH, 160);

    ctx.save();
    ctx.beginPath();
    ctx.arc(110, 80, 48, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = COLOR_GREEN;
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = COLOR_WHITE;
    ctx.font = '900 32px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText((data.nombreAsesor || 'A')[0].toUpperCase(), 110, 93);

    let textStartX = 180;

    ctx.textAlign = 'left';
    ctx.fillStyle = '#a7f3d0';
    ctx.font = '800 18px "Segoe UI", sans-serif';
    ctx.fillText((data.tipoAsesor === 'Agencia' && data.nombreAgencia ? data.nombreAgencia : 'AGENTE VERIFICADO').toUpperCase(), textStartX, 62);

    ctx.fillStyle = COLOR_WHITE;
    ctx.font = '900 32px "Segoe UI", sans-serif';
    ctx.fillText((data.nombreAsesor || 'Asesor EcoNexus').substring(0, 32), textStartX, 108);

    ctx.fillStyle = '#fde047';
    ctx.font = '700 22px "Segoe UI", sans-serif';
    ctx.fillText(`WhatsApp: ${data.telefonoAsesor || ''}`, textStartX, 140);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#a7f3d0';
    ctx.font = '800 14px "Segoe UI", sans-serif';
    ctx.fillText('EcoNexus', 1020, 90);

    const fotoX = 60, fotoY = 210, fotoW = 960, fotoH = 900;

    ctx.save();
    roundRect(ctx, fotoX, fotoY, fotoW, fotoH, 40);
    ctx.clip();

    const slideOffset = -progress * fotoW;
    drawImageCover(ctx, currentImg, fotoX, fotoY, fotoW, fotoH, slideOffset);
    if (progress > 0 && nextImg) {
      drawImageCover(ctx, nextImg, fotoX, fotoY, fotoW, fotoH, fotoW + slideOffset);
    }

    const gradFoto = ctx.createLinearGradient(0, fotoY + fotoH - 200, 0, fotoY + fotoH);
    gradFoto.addColorStop(0, 'rgba(0,0,0,0)');
    gradFoto.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = gradFoto;
    ctx.fillRect(fotoX, fotoY + fotoH - 200, fotoW, 200);
    ctx.restore();

    const opTexto = (data.operacion || 'VENTA').toUpperCase();
    roundRect(ctx, fotoX + 22, fotoY + 22, 220, 60, 30);
    ctx.fillStyle = COLOR_GREEN;
    ctx.fill();
    ctx.fillStyle = COLOR_WHITE;
    ctx.font = '900 24px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(opTexto, fotoX + 22 + 110, fotoY + 22 + 40);

    roundRect(ctx, fotoX + fotoW - 240, fotoY + 22, 220, 60, 30);
    ctx.fillStyle = COLOR_GREEN;
    ctx.fill();
    ctx.fillStyle = COLOR_WHITE;
    ctx.font = '900 22px "Segoe UI", sans-serif';
    ctx.fillText(`ID: ${data.codigoEco || 'ECO-000'}`, fotoX + fotoW - 240 + 110, fotoY + 22 + 40);

    const precioTexto = data.precio || '$0';
    ctx.font = '900 54px "Segoe UI", sans-serif';
    const precioAncho = ctx.measureText(precioTexto).width + 70;
    roundRect(ctx, fotoX + 22, fotoY + fotoH - 100, precioAncho, 78, 26);
    ctx.fillStyle = COLOR_GREEN;
    ctx.fill();
    ctx.fillStyle = COLOR_WHITE;
    ctx.font = '900 46px "Segoe UI", sans-serif';
    ctx.fillText(precioTexto, fotoX + 22 + precioAncho / 2, fotoY + fotoH - 42);

    roundRect(ctx, fotoX + fotoW - 160, fotoY + fotoH - 100, 140, 60, 26);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.fill();
    ctx.fillStyle = COLOR_WHITE;
    ctx.font = '800 24px "Segoe UI", sans-serif';
    ctx.fillText(`${slideNumber}/${totalSlides}`, fotoX + fotoW - 160 + 70, fotoY + fotoH - 62);

    if (mode === "burst-first" && images.length > 1) {
      ctx.save();
      roundRect(ctx, 1020, fotoY + 40, 60, fotoH - 80, 18);
      ctx.clip();
      drawImageCover(ctx, images[1], 1020, fotoY + 40, 200, fotoH - 80);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
      ctx.fillRect(1020, fotoY + 40, 60, fotoH - 80);
      ctx.restore();

      roundRect(ctx, 640, fotoY + fotoH - 115, 320, 60, 30);
      ctx.fillStyle = '#f59e0b';
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.font = '900 22px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('TOCA PARA VER MÁS ➔', 800, fotoY + fotoH - 75);
    }

    const filmY = fotoY + fotoH + 20;
    const filmH = 140;
    const filmGap = 14;
    const totalFilmW = Math.min(images.length, 4);
    const thumbW = 200;
    const startX = (WIDTH - (totalFilmW * thumbW + (totalFilmW - 1) * filmGap)) / 2;

    for (let t = 0; t < totalFilmW; t++) {
      const thumbX = startX + t * (thumbW + filmGap);
      const estaActiva = (t === currentIndex);

      ctx.save();
      roundRect(ctx, thumbX, filmY, thumbW, filmH, 18);
      ctx.clip();
      drawImageCover(ctx, images[t], thumbX, filmY, thumbW, filmH);
      if (!estaActiva) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
        ctx.fillRect(thumbX, filmY, thumbW, filmH);
      }
      ctx.restore();

      if (estaActiva) {
        ctx.lineWidth = 5;
        ctx.strokeStyle = COLOR_GREEN;
        roundRect(ctx, thumbX, filmY, thumbW, filmH, 18);
        ctx.stroke();
      }
    }

    const infoY = filmY + filmH + 25;

    ctx.textAlign = 'left';
    ctx.fillStyle = COLOR_TEXT;
    ctx.font = '900 38px "Segoe UI", sans-serif';
    const tituloLineas = wrapText(ctx, data.titulo || 'Inmueble', 720, 2);
    tituloLineas.forEach((linea, i) => {
      ctx.fillText(linea, 60, infoY + 40 + i * 46);
    });

    ctx.fillStyle = COLOR_TEXT_MUTED;
    ctx.font = '700 24px "Segoe UI", sans-serif';
    const ubiY = infoY + 40 + tituloLineas.length * 46 + 12;
    const ubiTexto = `📍 ${data.ubicacion || ''}`;
    const ubiTruncada = ctx.measureText(ubiTexto).width > 720
      ? ubiTexto.substring(0, 50) + '...'
      : ubiTexto;
    ctx.fillText(ubiTruncada, 60, ubiY);

    const specY = ubiY + 45;
    const specs = [
      { icon: '🛏️', val: `${data.habitaciones || 0} Hab` },
      { icon: '🚿', val: `${data.banos || 0} Baños` },
      { icon: '📐', val: `${data.area || 0}m²` },
      { icon: '🚗', val: `${data.puestos || 0} Puestos` }
    ];

    let specX = 60;
    specs.forEach(s => {
      ctx.font = '800 18px "Segoe UI", sans-serif';
      const textoSpec = `${s.icon} ${s.val}`;
      const anchoPill = ctx.measureText(textoSpec).width + 32;
      roundRect(ctx, specX, specY, anchoPill, 44, 22);
      ctx.fillStyle = COLOR_GREEN_SOFT;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = COLOR_GREEN_BORDER;
      ctx.stroke();
      ctx.fillStyle = '#059669';
      ctx.font = '800 18px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(textoSpec, specX + anchoPill / 2, specY + 30);
      specX += anchoPill + 12;
    });

    if (images._qrImg) {
      const qrBoxX = 830;
      const qrBoxY = infoY - 10;
      const qrBoxSize = 190;

      ctx.save();
      ctx.shadowColor = 'rgba(15, 23, 42, 0.15)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 6;
      roundRect(ctx, qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 18);
      ctx.fillStyle = COLOR_WHITE;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#e2e8f0';
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(images._qrImg, qrBoxX + 14, qrBoxY + 14, qrBoxSize - 28, qrBoxSize - 28);
      ctx.restore();

      ctx.fillStyle = COLOR_GREEN;
      ctx.font = '900 16px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('ESCANEA', qrBoxX + qrBoxSize / 2, qrBoxY + qrBoxSize + 24);
    }

    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 18px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Ficha generada en econexusplatform.com/menu', WIDTH / 2, HEIGHT - 50);
  }

  function canvasToFile(canvas, filename) {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(new File([blob], filename, { type: "image/jpeg" }));
      }, "image/jpeg", 0.92);
    });
  }

  function esDispositivoMovil() {
    if (typeof navigator === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      || (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  }

  async function shareBurstStatus(propertyData, onProgress) {
    if (onProgress) onProgress("Cargando fotografías en alta definición...");
    const urls = (propertyData.fotos || []).slice(0, 4);
    if (!urls.length) throw new Error("El inmueble necesita al menos 1 fotografía.");

    const images = await Promise.all(urls.map(loadImage));

    let qrImg = null;
    if (propertyData.urlFicha) {
      try {
        const QRious = window.QRious;
        if (QRious) {
          const qr = new QRious({
            value: propertyData.urlFicha,
            size: 500,
            level: 'M',
            background: '#ffffff',
            foreground: '#0f172a'
          });
          const qrDataUrl = qr.toDataURL('image/png');
          qrImg = await loadImage(qrDataUrl);
        }
      } catch (err) {
        console.warn('No se pudo generar el QR:', err);
      }
    }
    images._qrImg = qrImg;

    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext("2d");

    const files = [];
    for (let i = 0; i < images.length; i++) {
      if (onProgress) onProgress(`Diseñando lámina ${i + 1} de ${images.length}...`);
      renderBentoFrame(ctx, propertyData, images, {
        currentIndex: i,
        nextIndex: (i + 1) % images.length,
        progress: 0,
        mode: i === 0 ? "burst-first" : "burst-next",
        slideNumber: i + 1,
        totalSlides: images.length
      });
      const file = await canvasToFile(canvas, `estado-${propertyData.codigoEco || 'ECO'}-${i + 1}.jpg`);
      files.push(file);
    }

    await triggerNativeShare(files, propertyData, onProgress);
  }

  async function shareVideoStatus(propertyData, onProgress) {
    if (onProgress) onProgress("Preparando estudio de animación...");
    const urls = (propertyData.fotos || []).slice(0, 4);
    if (!urls.length) throw new Error("El inmueble necesita al menos 1 fotografía.");

    const images = await Promise.all(urls.map(loadImage));

    let qrImg = null;
    if (propertyData.urlFicha) {
      try {
        const QRious = window.QRious;
        if (QRious) {
          const qr = new QRious({
            value: propertyData.urlFicha,
            size: 500,
            level: 'M',
            background: '#ffffff',
            foreground: '#0f172a'
          });
          const qrDataUrl = qr.toDataURL('image/png');
          qrImg = await loadImage(qrDataUrl);
        }
      } catch (err) {
        console.warn('No se pudo generar el QR:', err);
      }
    }
    images._qrImg = qrImg;

    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext("2d");

    const mimeTypes = [
      "video/mp4;codecs=avc1.42E01E",
      "video/mp4",
      "video/webm;codecs=vp9",
      "video/webm"
    ];
    const selectedMime = mimeTypes.find((m) => MediaRecorder.isTypeSupported(m)) || "video/webm";
    const extension = selectedMime.includes("mp4") ? "mp4" : "webm";

    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, {
      mimeType: selectedMime,
      videoBitsPerSecond: 6500000
    });

    const chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    const recordingPromise = new Promise((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: selectedMime });
        const file = new File([blob], `estado-${propertyData.codigoEco || 'ECO'}.${extension}`, { type: selectedMime });
        resolve(file);
      };
    });

    recorder.start(100);

    const fps = 30;
    const holdFrames = Math.round(1.8 * fps);
    const transitionFrames = Math.round(0.7 * fps);
    const totalPerSlide = holdFrames + transitionFrames;
    const totalFrames = images.length * totalPerSlide;
    const tiempoInicio = performance.now();

    for (let frame = 0; frame < totalFrames; frame++) {
      const currentIndex = Math.floor(frame / totalPerSlide);
      const nextIndex = (currentIndex + 1) % images.length;
      const frameInSlide = frame % totalPerSlide;

      let rawProgress = 0;
      if (frameInSlide > holdFrames) {
        rawProgress = (frameInSlide - holdFrames) / transitionFrames;
      }
      const smoothProgress = rawProgress < 0.5
        ? 4 * rawProgress * rawProgress * rawProgress
        : 1 - Math.pow(-2 * rawProgress + 2, 3) / 2;

      renderBentoFrame(ctx, propertyData, images, {
        currentIndex,
        nextIndex,
        progress: smoothProgress,
        mode: "video",
        slideNumber: currentIndex + 1,
        totalSlides: images.length
      });

      if (frame % 15 === 0 && onProgress) {
        const pct = Math.round((frame / totalFrames) * 100);
        onProgress(`Renderizando carrusel (${pct}%)...`);
      }

      const tiempoObjetivo = tiempoInicio + ((frame + 1) * 1000 / fps);
      const espera = Math.max(0, tiempoObjetivo - performance.now());
      if (espera > 0) {
        await new Promise(r => setTimeout(r, espera));
      }
    }

    recorder.stop();
    const videoFile = await recordingPromise;

    await triggerNativeShare([videoFile], propertyData, onProgress, true);
  }

  async function triggerNativeShare(files, data, onProgress, requiereSegundoToque = false) {
    const captionText = `🏡 *${data.titulo || "Inmueble Disponible"}* — ${data.precio || ""}\n📍 ${data.ubicacion || ""}\n👉 Ficha completa y fotos aquí:\n${data.urlFicha || window.location.href}`;

    if (navigator.clipboard && data.urlFicha) {
      try {
        await navigator.clipboard.writeText(data.urlFicha);
      } catch (err) {
      }
    }

    const esMovil = esDispositivoMovil();
    const puedeCompartir = navigator.canShare && navigator.canShare({ files });

    if (esMovil && puedeCompartir) {
      if (onProgress) onProgress("Abriendo selector de WhatsApp...");
      try {
        await navigator.share({
          files,
          title: data.titulo || "Ficha Técnica",
          text: captionText
        });
      } catch (shareErr) {
        console.warn('Share cancelado o fallido:', shareErr);
        if (shareErr.name !== 'AbortError') {
          descargarFallback(files);
        }
      }
    } else {
      if (onProgress) onProgress("Descargando archivos (modo compatibilidad)...");
      descargarFallback(files);
    }
  }

  function descargarFallback(files) {
    files.forEach((file, idx) => {
      setTimeout(() => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(file);
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }, idx * 300);
    });
  }

  return {
    shareBurstStatus,
    shareVideoStatus,
    WIDTH,
    HEIGHT
  };
})();

window.WAStatusEngine = WAStatusEngine;
