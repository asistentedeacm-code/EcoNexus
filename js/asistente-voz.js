/**
 * MÓDULO EXTERNO: ASISTENTE VIRTUAL POR VOZ AVANZADO (EcoNexus)
 * Ubicación: /js/asistente-voz.js
 * Optimizado para procesamiento local, bajo consumo de cuotas y máxima precisión.
 */

(function () {
    let synth = window.speechSynthesis;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let reconocimiento = null;
    let estadoAsistente = 'IDLE'; // IDLE, SEARCHING, WAITING_SELECTION
    let opcionesVozGlobal = [];
    let loteActualVoz = 0;
    const TAMANO_LOTE_VOZ = 3;

    // Exponer globalmente
    window.opcionesVozGlobal = [];

    const SALUDOS = ['hola', 'buenos días', 'buenas tardes', 'buenas noches', 'saludos', 'hey', 'qué tal', 'ola'];

    if (SpeechRecognition) {
        reconocimiento = new SpeechRecognition();
        reconocimiento.lang = 'es-VE';
        reconocimiento.continuous = false;
        reconocimiento.interimResults = false;

        reconocimiento.onstart = () => {
            if (typeof solicitarWakeLock === 'function') solicitarWakeLock();
            const btnMic = document.getElementById('btnAsistenteVoz');
            if (btnMic) btnMic.classList.add('listening-mic');
            if (synth && synth.speaking) synth.cancel();
        };

        reconocimiento.onresult = (event) => {
            const transcript = event.results[0][0].transcript.toLowerCase().trim();
            procesarComandoVozAvanzado(transcript);
        };

        reconocimiento.onerror = (event) => {
            detenerAsistenteVoz();
            if (event.error !== 'no-speech') console.warn("Aviso Micrófono:", event.error);
        };

        reconocimiento.onend = () => {
            const btnMic = document.getElementById('btnAsistenteVoz');
            if (btnMic) btnMic.classList.remove('listening-mic');
            if (estadoAsistente === 'IDLE') {
                ocultarUIAsistente();
                if (typeof liberarWakeLock === 'function') liberarWakeLock();
            }
        };
    }

    window.iniciarAsistenteVoz = function () {
        if (!reconocimiento) {
            alert("Tu navegador no soporta búsqueda inteligente por voz. Utiliza Google Chrome o Safari.");
            return;
        }
        estadoAsistente = 'SEARCHING';
        mostrarUIAsistente("Asistente EcoNexus escuchando...");
        dictarTextoAsistente("¡Hola! Soy tu asistente virtual EcoNexus. ¿Qué tipo de inmueble, zona o presupuesto deseas buscar?", () => {
            try { reconocimiento.start(); } catch (e) {}
        });
    };

    window.detenerAsistenteVoz = function () {
        if (reconocimiento) reconocimiento.stop();
        if (synth) synth.cancel();
        estadoAsistente = 'IDLE';
        ocultarUIAsistente();
        cerrarModalCarruselVoz();
        const btnMic = document.getElementById('btnAsistenteVoz');
        if (btnMic) btnMic.classList.remove('listening-mic');
        if (typeof liberarWakeLock === 'function') liberarWakeLock();
    };

    function mostrarUIAsistente(texto) {
        const ui = document.getElementById("uiAsistenteVoz");
        const txt = document.getElementById("textoAsistenteVoz");
        if (txt) txt.textContent = texto;
        if (ui) {
            ui.classList.remove("translate-y-10", "opacity-0", "pointer-events-none");
            ui.classList.add("translate-y-0", "opacity-100", "pointer-events-auto");
        }
    }

    function actualizarUIAsistente(texto) {
        const txt = document.getElementById("textoAsistenteVoz");
        if (txt) txt.textContent = texto;
    }

    function ocultarUIAsistente() {
        const ui = document.getElementById("uiAsistenteVoz");
        if (ui) {
            ui.classList.remove("translate-y-0", "opacity-100", "pointer-events-auto");
            ui.classList.add("translate-y-10", "opacity-0", "pointer-events-none");
        }
    }

    function dictarTextoAsistente(texto, callbackFin = null) {
        if (!synth) {
            if (callbackFin) callbackFin();
            return;
        }
        synth.cancel();
        if (typeof solicitarWakeLock === 'function') solicitarWakeLock();
        const utterance = new SpeechSynthesisUtterance(texto);
        utterance.lang = 'es-ES';
        utterance.rate = 1.02;
        utterance.onend = () => {
            if (callbackFin) callbackFin();
            else if (typeof liberarWakeLock === 'function') liberarWakeLock();
        };
        synth.speak(utterance);
    }

    async function procesarComandoVozAvanzado(transcript) {
        // 1. Reconocimiento de saludos conversacionales
        const esSaludo = SALUDOS.some(s => transcript === s || transcript.startsWith(s + ' '));
        if (esSaludo && transcript.split(' ').length <= 4) {
            actualizarUIAsistente("¡Hola! ¿Qué deseas buscar hoy?");
            dictarTextoAsistente("¡Hola! Es un placer saludarte. Dime qué zona, tipo de inmueble o precio estás buscando.", () => {
                try { reconocimiento.start(); } catch(e){}
            });
            return;
        }

        // 2. Si el usuario está eligiendo una opción del carrusel dictado
        if (estadoAsistente === 'WAITING_SELECTION') {
            manejarSeleccionOpcionVoz(transcript);
            return;
        }

        // 3. Extracción de filtros y ejecución de búsqueda con cero impacto en cuotas innecesarias
        actualizarUIAsistente(`Buscando: "${transcript}"`);
        const inputFiltro = document.getElementById("filterText");
        if (inputFiltro) inputFiltro.value = transcript;

        if (typeof cargarPropiedades === 'function') {
            await cargarPropiedades(true);
        }

        const listaEncontrada = window.propiedadesCargadas || [];
        if (listaEncontrada.length === 0) {
            actualizarUIAsistente("No se encontraron coincidencias.");
            dictarTextoAsistente("Lo siento, no encontré propiedades con esa descripción exacta. Prueba mencionando otra zona o tipo de inmueble.", () => {
                detenerAsistenteVoz();
            });
            return;
        }

        opcionesVozGlobal = listaEncontrada;
        window.opcionesVozGlobal = opcionesVozGlobal;
        loteActualVoz = 0;

        renderizarModalCarruselVoz();
        narrarLoteActualVoz();
    }

    function renderizarModalCarruselVoz() {
        const modal = document.getElementById("modalCarruselVoz");
        const track = document.getElementById("trackCarruselVoz");
        const indicador = document.getElementById("loteIndicadorVoz");
        if (!modal || !track) return;

        track.innerHTML = "";
        const inicio = loteActualVoz * TAMANO_LOTE_VOZ;
        const fin = Math.min(inicio + TAMANO_LOTE_VOZ, opcionesVozGlobal.length);
        const loteSlice = opcionesVozGlobal.slice(inicio, fin);

        if (indicador) indicador.textContent = `Mostrando ${inicio + 1}-${fin} de ${opcionesVozGlobal.length}`;

        loteSlice.forEach((p, idxAbsoluto) => {
            const indexReal = inicio + idxAbsoluto + 1;
            const foto = (p.fotos && p.fotos.length > 0) ? p.fotos[0] : "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=800&q=80";
            
            track.innerHTML += `
              <div onclick="abrirModal('${p.id}'); cerrarModalCarruselVoz();" class="min-w-[200px] max-w-[200px] bg-gray-800/90 rounded-xl overflow-hidden border border-emerald-500/50 shadow-xl cursor-pointer flex-shrink-0 snap-start flex flex-col group hover:border-emerald-400 transition">
                <div class="h-28 overflow-hidden relative">
                  <img src="${foto}" class="w-full h-full object-cover group-hover:scale-105 transition" />
                  <span class="absolute top-1.5 left-1.5 bg-emerald-600 text-white text-[9px] font-extrabold px-2 py-0.5 rounded-full shadow">Opción ${indexReal}</span>
                  <span class="absolute bottom-1.5 right-1.5 bg-black/75 text-white text-[9px] px-2 py-0.5 rounded font-black">$${Number(p.precio).toLocaleString('en-US')}</span>
                </div>
                <div class="p-2.5 flex flex-col justify-between flex-grow">
                  <h5 class="text-[10px] font-bold text-white line-clamp-1 mb-0.5">${p.titulo}</h5>
                  <p class="text-[9px] text-emerald-400 truncate"><i class="fa-solid fa-location-dot"></i> ${p.ubicacion}</p>
                </div>
              </div>
            `;
        });

        modal.classList.remove("hidden");
        modal.style.display = 'flex';
    }

    window.cerrarModalCarruselVoz = function() {
        const modal = document.getElementById("modalCarruselVoz");
        if (modal) {
            modal.classList.add("hidden");
            modal.style.display = 'none';
        }
    };

    function narrarLoteActualVoz() {
        const inicio = loteActualVoz * TAMANO_LOTE_VOZ;
        const fin = Math.min(inicio + TAMANO_LOTE_VOZ, opcionesVozGlobal.length);
        const loteSlice = opcionesVozGlobal.slice(inicio, fin);

        let mensaje = `Encontré ${opcionesVozGlobal.length} opciones. Leyendo lote ${loteActualVoz + 1}. `;
        loteSlice.forEach((p, idx) => {
            const numeroOpcion = inicio + idx + 1;
            mensaje += `Opción ${numeroOpcion}: ${p.tipo} en ${p.ubicacion}, por ${Number(p.precio).toLocaleString('en-US')} dólares. `;
        });

        if (opcionesVozGlobal.length > fin) {
            mensaje += "Di 'más opciones' para escuchar el siguiente lote, o di el número de la opción que deseas abrir.";
        } else {
            mensaje += "¿Cuál de estas opciones te interesa abrir? Di el número.";
        }

        actualizarUIAsistente("¿Cuál opción deseas abrir? (Ej: Opción 1)");
        dictarTextoAsistente(mensaje, () => {
            estadoAsistente = 'WAITING_SELECTION';
            try { reconocimiento.start(); } catch(e){}
        });
    }

    function manejarSeleccionOpcionVoz(transcript) {
        const texto = transcript.toLowerCase();

        if (texto.includes('más') || texto.includes('siguiente') || texto.includes('otra') || texto.includes('lote')) {
            loteActualVoz++;
            if (loteActualVoz * TAMANO_LOTE_VOZ >= opcionesVozGlobal.length) {
                loteActualVoz = 0;
            }
            renderizarModalCarruselVoz();
            narrarLoteActualVoz();
            return;
        }

        const numerosMap = {
            'uno': 1, '1': 1, 'primera': 1, 'primer': 1,
            'dos': 2, '2': 2, 'segunda': 2, 'segundo': 2,
            'tres': 3, '3': 3, 'tercera': 3, 'tercer': 3,
            'cuatro': 4, '4': 4, 'cuarta': 4,
            'cinco': 5, '5': 5, 'quinta': 5,
            'seis': 6, '6': 6,
            'siete': 7, '7': 7,
            'ocho': 8, '8': 8,
            'nueve': 9, '9': 9,
            'diez': 10, '10': 10
        };

        let seleccion = -1;
        for (const [key, val] of Object.entries(numerosMap)) {
            if (texto.includes(key)) {
                seleccion = val;
                break;
            }
        }

        if (seleccion !== -1 && seleccion <= opcionesVozGlobal.length) {
            const indexReal = seleccion - 1;
            actualizarUIAsistente(`Abriendo opción ${seleccion}...`);
            dictarTextoAsistente(`Abriendo ficha detallada.`, () => {
                detenerAsistenteVoz();
                if (typeof abrirModal === 'function') {
                    abrirModal(opcionesVozGlobal[indexReal].id);
                    setTimeout(() => {
                        if (typeof toggleLecturaVoz === 'function') toggleLecturaVoz();
                    }, 900);
                }
            });
        } else {
            estadoAsistente = 'SEARCHING';
            const inputFiltro = document.getElementById("filterText");
            if (inputFiltro) inputFiltro.value = transcript;
            actualizarUIAsistente(`Filtrando: "${transcript}"`);
            procesarComandoVozAvanzado(transcript);
        }
    }
})();
