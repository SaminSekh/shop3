/**
 * Sitemap Generator for Shop Management System
 * This script fetches all active shops from Supabase and generates a sitemap.xml structure.
 * You can run this in your browser console on the admin page or via a Node.js script.
 */

async function generateSitemap() {
    const DOMAIN = window.location.origin; // Or hardcode your production domain: 'https://yourdomain.com'
    const { data: shops, error } = await supabaseClient
        .from('shops')
        .select('slug, updated_at')
        .eq('status', 'active');

    if (error) {
        console.error('Error fetching shops:', error);
        return;
    }

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    // Add Home Page
    xml += `  <url>\n`;
    xml += `    <loc>${DOMAIN}/</loc>\n`;
    xml += `    <changefreq>weekly</changefreq>\n`;
    xml += `    <priority>1.0</priority>\n`;
    xml += `  </url>\n`;

    // Add each Shop
    shops.forEach(shop => {
        const slug = shop.slug || shop.id; // Fallback to ID if slug missing
        const lastMod = new Date(shop.updated_at || new Date()).toISOString().split('T')[0];

        xml += `  <url>\n`;
        xml += `    <loc>${DOMAIN}/${slug}</loc>\n`;
        xml += `    <lastmod>${lastMod}</lastmod>\n`;
        xml += `    <changefreq>daily</changefreq>\n`;
        xml += `    <priority>0.8</priority>\n`;
        xml += `  </url>\n`;
    });

    xml += `</urlset>`;

    console.log('--- GENERATED SITEMAP.XML ---');
    console.log(xml);

    // Optional: Download the file automatically
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sitemap.xml';
    a.click();
}

// To use:
// 1. Open your admin dashboard
// 2. Open Chrome Console (F12)
// 3. Paste this script and run: generateSitemap();
