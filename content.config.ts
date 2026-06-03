import {defineCollection, defineContentConfig, z} from '@nuxt/content'

/**
 * Lessons are split into two locale collections that share the same
 * frontmatter shape. The Arabic copy is canonical (we authored it
 * first); the English copy is a hand-tuned translation. Each lesson's
 * `slug` is identical across locales so the same /lessons/<slug>
 * route works in both Arabic (default, no URL prefix) and English
 * (/en/lessons/<slug>).
 */
const lessonSchema = z.object({
  order:    z.number(),
  slug:     z.string(),
  title:    z.string(),    // lesson title in THIS collection's locale
  title_en: z.string(),    // cross-reference: always the English title
  icon:     z.string(),
  track:    z.enum(['foundation', 'io', 'comm', 'analog', 'pro', 'bonus', 'capstone']),
  level:    z.enum(['beginner', 'intermediate', 'advanced']),
  minutes:  z.number(),
  tags:     z.array(z.string())
})

export default defineContentConfig({
  collections: {
    lessons_ar: defineCollection({
      type: 'page',
      source: 'lessons/ar/*.md',
      schema: lessonSchema
    }),
    lessons_en: defineCollection({
      type: 'page',
      source: 'lessons/en/*.md',
      schema: lessonSchema
    })
  }
})
