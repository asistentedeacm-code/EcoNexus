const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://gvcklmqldswxfweliuio.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const BASE_URL = 'https://asistentedeacm-code.github.io/EcoNexus';

async function fetchSupabase(endpoint) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
    });
    return await response.json();
}

function generateHTML(prop) {
    const fotoPrincipal = prop.fotos && prop.fotos.length > 0 ? prop.fotos[0] : `${BASE_URL}/logo.png.png`;
    const precio = Number(prop.precio).toLocaleString('en-US');
    const descLimpia = prop.descripcion ? prop.descripcion.substring(0, 150).replace(/"/g, '') : 'Inmueble en EcoNexus';
    
    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>${prop.titulo} | EcoNexus</title>
    <meta name="description" content="${prop.operacion} de ${prop.tipo} en ${prop.ubicacion}. Precio: $${precio}. Código: ${prop.codigo_eco}.">
    <link rel="canonical" href="${BASE_URL}/inmueble/${prop.codigo_eco.toLowerCase()}.html">
    
    <meta property="og:title" content="${prop.titulo}">
    <meta property="og:description" content="Precio: $${precio} | ${prop.habitaciones} Hab | ${prop.banos} Baños | ${prop.metros} m²">
    <meta property="og:image" content="${fotoPrincipal}">
    <meta property="og:url" content="${BASE_URL}/inmueble/${prop.codigo_eco.toLowerCase()}.html">
    <meta property="og:type" content="website">

    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "RealEstateListing",
      "name": "${prop.titulo}",
      "description": "${descLimpia}...",
      "image": "${fotoPrincipal}",
      "offers": {
        "@type": "Offer",
        "price": "${prop.precio}",
        "priceCurrency": "USD"
      }
    }
    </script>

    <script>
        window.location.replace("${BASE_URL}/index.html?codigo=${prop.codigo_eco}");
    </script>
</head>
<body style="background-color:#1E3F20; color:white; text-align:center; padding:50px; font-family:sans-serif;">
    <h2>Redirigiendo al inmueble...</h2>
    <p>Si no eres redirigido, <a href="${BASE_URL}/index.html?codigo=${prop.codigo_eco}" style="color:#a8d5ba;">haz clic aquí</a>.</p>
</body>
</html>`;
}

async function run() {
    console.log("Iniciando generación de páginas SEO...");
    
    const propiedades = await fetchSupabase('v_propiedades_catalogo?select=codigo_eco,titulo,precio,operacion,tipo,ubicacion,habitaciones,banos,metros,descripcion,fotos,fecha_publicacion&estatus=eq.Disponible');

    const dirInmuebles = path.join(__dirname, 'inmueble');
    if (!fs.existsSync(dirInmuebles)) {
        fs.mkdirSync(dirInmuebles);
    }

    let sitemapXML = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    // URLs fijas base
    const estaticas = [
        { loc: '/', priority: '1.0' },
        { loc: '/captacion.html', priority: '0.8' },
        { loc: '/menu.html', priority: '0.5' }
    ];
    estaticas.forEach(page => {
        sitemapXML += `  <url>\n    <loc>${BASE_URL}${page.loc}</loc>\n    <changefreq>daily</changefreq>\n    <priority>${page.priority}</priority>\n  </url>\n`;
    });

    propiedades.forEach(p => {
        const fileName = `${p.codigo_eco.toLowerCase()}.html`;
        const htmlContent = generateHTML(p);
        fs.writeFileSync(path.join(dirInmuebles, fileName), htmlContent);
        
        const fecha = p.fecha_publicacion ? p.fecha_publicacion.split('T')[0] : new Date().toISOString().split('T')[0];
        sitemapXML += `  <url>\n    <loc>${BASE_URL}/inmueble/${fileName}</loc>\n    <lastmod>${fecha}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.9</priority>\n  </url>\n`;
    });

    sitemapXML += `</urlset>`;
    fs.writeFileSync('sitemap.xml', sitemapXML);
    console.log(`Generadas ${propiedades.length} páginas SEO estáticas y sitemap.`);
}

run();
