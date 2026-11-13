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

function generateHTML(prop) {
    const fotoPrincipal = prop.fotos && prop.fotos.length > 0 ? prop.fotos[0] : `${BASE_URL}/og-brand.jpg`;
    const precio = Number(prop.precio).toLocaleString('en-US');
    const descLimpia = prop.descripcion ? prop.descripcion.substring(0, 150).replace(/"/g, '').replace(/\n/g, ' ') : 'Inmueble disponible en EcoNexus';
    const tituloEscapado = escapeXML(prop.titulo);
    const ubicacionEscapada = escapeXML(prop.ubicacion);
    const tipoEscapado = escapeXML(prop.tipo);
    const operacionEscapada = escapeXML(prop.operacion);
    const urlFicha = `${BASE_URL}/inmueble/${prop.codigo_eco.toLowerCase()}.html`;

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

    <!-- SCHEMA.ORG / JSON-LD PARA GOOGLE -->
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

async function run() {
    console.log("Iniciando generación con dominio propio econexusplatform.com...");
    
    const propiedades = await fetchSupabase('v_propiedades_catalogo?select=codigo_eco,titulo,precio,operacion,tipo,ubicacion,habitaciones,banos,metros,descripcion,fotos,fecha_publicacion&estatus=eq.Disponible');

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

    console.log(`Completado. Landings y XMLs generados para ${BASE_URL}.`);
}

run();
