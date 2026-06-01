const BASE = 'https://ch32v003.shakir.sd'

export default defineEventHandler(async (event) => {
  const lessons = await queryCollection(event, 'lessons').order('order', 'ASC').all()

  const staticRoutes = ['/', '/lessons', '/resources', '/about']
  const lessonRoutes = lessons.map((l) => `/lessons/${l.slug}`)

  const urls = [...staticRoutes, ...lessonRoutes]
    .map(
      (path) => `  <url>
    <loc>${BASE}${path}</loc>
    <changefreq>weekly</changefreq>
    <priority>${path === '/' ? '1.0' : '0.7'}</priority>
  </url>`
    )
    .join('\n')

  setHeader(event, 'Content-Type', 'application/xml')
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`
})
