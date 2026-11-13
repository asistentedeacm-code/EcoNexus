const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://gvcklmqldswxfweliuio.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
// DOMINIO OFICIAL PROPIO
const BASE_URL = 'https://econexusplatform.com';

async function fetchSupabase(endpoint) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
    });
    return await response.json();
}

function escapeXML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function mapPropertyTypeMeta(tipo) {
    if (!tipo) return 'other';
    const t = tipo.toLowerCase();
    if (t.includes('apartamento') || t.includes('apto')) return 'apartment';
    if (t.includes('casa') || t.includes('townhouse') || t.includes('quinta')) return 'house';
    if (t.includes('local') || t.includes('galpon') || t.includes('oficina')) return 'commercial';
    if (t.includes('terreno') || t.includes('parcela')) return 'land';
    return 'other';
}

// ✅ NUEVO: Genera el schema Product (Venta) o Accommodation (Alquiler)
// para que Google muestre rich snippets tipo Mercado Libre.
function generarRichSnippetSchema(prop, fotoPrincipal, urlFicha, descLimpia) {
    const tituloEscapado = escapeXML(prop.titulo);
    const precioStr = String(prop.precio || 0);
    const esAlquiler = String(prop.operacion || '').toLowerCase().includes('alquiler');

    if (esAlquiler) {
        // ─── Accommodation (Alquiler) ───
        return {
            '@context': 'https://schema.org',
            '@type': 'Accommodation',
            'name': tituloEscapado,
            'description': escapeXML(descLimpia),
            'image': [fotoPrincipal],
            'url': urlFicha,
            'numberOfRooms': Number(prop.habitaciones) || 0,
            'numberOfBathroomsTotal': Number(prop.banos) || 0,
            'floorSize': { '@type': 'QuantitativeValue', 'value': Number(prop.metros) || 0, 'unitCode': 'MTK' },
            'address': {
                '@type': 'PostalAddress',
                'addressLocality': escapeXML(prop.ubicacion),
                'addressCountry': 'VE'
            },
            'offers': {
                '@type': 'Offer',
                'url': urlFicha,
                'price': precioStr,
                'priceCurrency': 'USD',
                'availability': 'https://schema.org/InStock'
            }
        };
    } else {
        // ─── Product (Venta) ───
        return {
            '@context': 'https://schema.org',
            '@type': 'Product',
            'name': tituloEscapado,
            'description': escapeXML(descLimpia),
            'image': [fotoPrincipal],
            'url': urlFicha,
            'sku': prop.codigo_eco,
            'brand': { '@type': 'Organization', 'name': 'EcoNexus Platform' },
            'offers': {
                '@type': 'Offer',
                'url': urlFicha,
                'price': precioStr,
                'priceCurrency': 'USD',
                'availability': 'https://schema.org/InStock',
                'seller': {
                    '@type': 'RealEstateAgent',
                    'name': escapeXML(prop.nombre_asesor || 'Asesor EcoNexus')
                }
            }
        };
    }
}

function generateHTML(prop) {
    const fotoPrincipal = prop.fotos && prop.fotos.length > 0 ? prop.fotos[0] : `${BASE_URL}/og-brand.jpg`;
    const precio = Number(prop.precio).toLocaleString('en-US');
    const descLimpia = prop.descripcion ? prop.descripcion.substring(0, 150).replace(/"/g, '').replace(/\n/g, ' ') : 'Inmueble disponible en EcoNexus';
    const tituloEscapado = escapeXML(prop.titulo);
    const ubicacionEscapada = escapeXML(prop.ubicacion);
    const tipoEscapado = escapeXML(prop.tipo);
    const operacionEscapada = escapeXML(prop.operacion);
    const urlFicha = `${BASE_URL}/inmueble/${prop.codigo_eco.toLowerCase()}.html`;

    // ✅ NUEVO: Rich snippet (Product o Accommodation)
    const richSnippet = generarRichSnippetSchema(prop, fotoPrincipal, urlFicha, descLimpia);

    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${tituloEscapado} | EcoNexus</title>
    <meta name="description" content="${operacionEscapada} de ${tipoEscapado} en ${ubicacionEscapada}. Precio: $${precio} USD. Código: ${prop.codigo_eco}.">
    <link rel="canonical" href="${urlFicha}">
    
    <!-- ETIQUETAS OPEN GRAPH PARA PREVENTAS DE WHATSAPP / FACEBOOK / TELEGRAM -->
    <meta property="og:site_name" content="EcoNexus Red Inmobiliaria">
    <meta property="og:type" content="website">
    <meta property="og:url" content="${urlFicha}">
    <meta property="og:title" content="${tituloEscapado}">
    <meta property="og:description" content="💰 $${precio} USD • 🛏️ ${prop.habitaciones || 0} Hab • 🚿 ${prop.banos || 0} Baños • 📐 ${prop.metros || 0}m² | ${ubicacionEscapada}">
    <meta property="og:image" content="${fotoPrincipal}">
    <meta property="og:image:secure_url" content="${fotoPrincipal}">
    <meta property="og:image:type" content="image/jpeg">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">

    <!-- TWITTER CARDS -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${tituloEscapado}">
    <meta name="twitter:description" content="💰 $${precio} USD • 📍 ${ubicacionEscapada}">
    <meta name="twitter:image" content="${fotoPrincipal}">

    <!-- SCHEMA.ORG / JSON-LD #1: RealEstateListing (para BOTS DE IA) -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "RealEstateListing",
      "name": "${tituloEscapado}",
      "description": "${escapeXML(descLimpia)}",
      "image": "${fotoPrincipal}",
      "url": "${urlFicha}",
      "offers": {
        "@type": "Offer",
        "price": "${prop.precio}",
        "priceCurrency": "USD"
      }
    }
    </script>

    <!-- SCHEMA.ORG / JSON-LD #2: Product o Accommodation (para GOOGLE RICH SNIPPETS) -->
    <script type="application/ld+json">
    ${JSON.stringify(richSnippet)}
    </script>

    <!-- REDIRECCIÓN PWA PARA VISITANTES HUMANOS -->
    <script>
        window.location.replace("${BASE_URL}/index.html?codigo=${prop.codigo_eco}");
    </script>
</head>
<body style="background-color:#1E3F20; color:white; text-align:center; padding:50px; font-family:sans-serif;">
    <h2>Cargando inmueble en EcoNexus...</h2>
    <p>Si no eres redirigido automáticamente, <a href="${BASE_URL}/index.html?codigo=${prop.codigo_eco}" style="color:#a8d5ba; font-weight:bold;">haz clic aquí para ver la ficha completa</a>.</p>
</body>
</html>`;
}

// ✅ NUEVO: Genera el feed JSON limpio para bots de IA
// Estructura optimizada para ser consumida por LLMs (RAG, indexación, comparación).
function generarAiFeed(propiedades) {
    const properties = (propiedades || []).map(p => {
        const phoneClean = (p.telefono_asesor || '').replace(/[^0-9]/g, '');
        const waText = encodeURIComponent(`Hola, vi el inmueble ${p.codigo_eco} en EcoNexus y quiero más información.`);
        const urlFicha = `${BASE_URL}/inmueble/${p.codigo_eco.toLowerCase()}.html`;

        return {
            id: p.id || null,
            code: p.codigo_eco,
            title: p.titulo,
            type: p.tipo,
            operation: p.operacion,
            price: Number(p.precio) || 0,
            currency: 'USD',
            location: {
                text: p.ubicacion || 'Venezuela',
                country: 'VE'
            },
            bedrooms: Number(p.habitaciones) || 0,
            bathrooms: Number(p.banos) || 0,
            parking_spots: Number(p.estacionamientos) || 0,
            area_m2: Number(p.metros) || 0,
            description: (p.descripcion || '').substring(0, 500),
            images: Array.isArray(p.fotos) ? p.fotos : [],
            url: urlFicha,
            video_url: p.enlace_video || null,
            agent: {
                name: p.nombre_asesor || 'Asesor EcoNexus',
                phone: phoneClean || null,
                type: p.tipo_asesor || 'Independiente',
                agency: p.nombre_agencia || null,
                user_id: p.user_id || null,
                whatsapp_url: phoneClean ? `https://wa.me/${phoneClean}?text=${waText}` : null
            },
            published_at: p.fecha_publicacion || null,
            updated_at: new Date().toISOString()
        };
    });

    return {
        meta: {
            platform: 'EcoNexus Platform',
            description: 'Catálogo inmobiliario verificado en Venezuela. Compra, venta y alquiler con contacto directo al WhatsApp del asesor.',
            base_url: BASE_URL,
            catalog_url: `${BASE_URL}/`,
            country: 'Venezuela',
            currency: 'USD',
            generated_at: new Date().toISOString(),
            total_properties: properties.length,
            license: 'Public data for AI indexing. Attribution to econexusplatform.com appreciated.',
            contact: 'https://econexusplatform.com/'
        },
        properties
    };
}

async function run() {
    console.log("Iniciando generación con dominio propio econexusplatform.com...");
    
    // ✅ SELECT expandido para incluir datos de agente y campos necesarios para el feed IA
    const propiedades = await fetchSupabase('v_propiedades_catalogo?select=id,codigo_eco,titulo,precio,operacion,tipo,ubicacion,habitaciones,banos,estacionamientos,metros,descripcion,fotos,fecha_publicacion,telefono_asesor,nombre_asesor,tipo_asesor,nombre_agencia,user_id,enlace_video&estatus=eq.Disponible');

    const dirInmuebles = path.join(__dirname, 'inmueble');
    if (!fs.existsSync(dirInmuebles)) {
        fs.mkdirSync(dirInmuebles);
    }

    let sitemapXML = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    let metaXML = `<?xml version="1.0" encoding="UTF-8"?>\n<listings>\n`;

    const estaticas = [
        { loc: '/', priority: '1.0', freq: 'daily' },
        { loc: '/captacion.html', priority: '0.8', freq: 'daily' },
        { loc: '/menu.html', priority: '0.5', freq: 'daily' },
        { loc: '/busqueda-agente.html', priority: '0.8', freq: 'weekly' }
    ];

    estaticas.forEach(page => {
        sitemapXML += `  <url>\n    <loc>${BASE_URL}${page.loc}</loc>\n    <changefreq>${page.freq}</changefreq>\n    <priority>${page.priority}</priority>\n  </url>\n`;
    });

    if (Array.isArray(propiedades)) {
        propiedades.forEach(p => {
            const fileName = `${p.codigo_eco.toLowerCase()}.html`;
            const htmlContent = generateHTML(p);
            fs.writeFileSync(path.join(dirInmuebles, fileName), htmlContent);
            
            const fecha = p.fecha_publicacion ? p.fecha_publicacion.split('T')[0] : new Date().toISOString().split('T')[0];
            sitemapXML += `  <url>\n    <loc>${BASE_URL}/inmueble/${fileName}</loc>\n    <lastmod>${fecha}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.9</priority>\n  </url>\n`;

            const fotoPrincipal = p.fotos && p.fotos.length > 0 ? p.fotos[0] : `${BASE_URL}/og-brand.jpg`;
            const propTypeMeta = mapPropertyTypeMeta(p.tipo);
            const urlInmueble = `${BASE_URL}/inmueble/${fileName}`;

            metaXML += `  <listing>
    <home_listing_id>${escapeXML(p.codigo_eco)}</home_listing_id>
    <name>${escapeXML(p.titulo)}</name>
    <description>${escapeXML(p.descripcion ? p.descripcion.substring(0, 200).replace(/\n/g, ' ') : p.titulo)}</description>
    <url>${urlInmueble}</url>
    <image>
      <url>${fotoPrincipal}</url>
    </image>
    <price>${p.precio} USD</price>
    <property_type>${propTypeMeta}</property_type>
    <num_beds>${p.habitaciones || 0}</num_beds>
    <num_baths>${p.banos || 0}</num_baths>
    <area_size>${p.metros || 0}</area_size>
    <area_unit>SQ_M</area_unit>
    <address format="simple">
      <component name="addr1">${escapeXML(p.ubicacion)}</component>
      <component name="city">Valencia</component>
      <component name="region">Carabobo</component>
      <component name="country">Venezuela</component>
    </address>
  </listing>\n`;
        });
    }

    sitemapXML += `</urlset>`;
    metaXML += `</listings>`;

    fs.writeFileSync('sitemap.xml', sitemapXML);
    fs.writeFileSync('facebook-catalog.xml', metaXML);

    // ✅ NUEVO: Generar feed JSON para bots de IA
    const aiFeed = generarAiFeed(propiedades);
    fs.writeFileSync('ai-feed.json', JSON.stringify(aiFeed, null, 2));

    console.log(`Completado. Landings, XMLs y AI feed generados para ${BASE_URL}.`);
    console.log(`- ${(propiedades || []).length} inmuebles procesados`);
    console.log(`- ai-feed.json generado (${JSON.stringify(aiFeed).length} bytes)`);
    console.log(`- ⚠️  IMPORTANTE: el workflow debe subir ai-feed.json a R2 con wrangler (ver siguiente paso)`);
}

run();
