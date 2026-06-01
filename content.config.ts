import {defineCollection, defineContentConfig, z} from '@nuxt/content'

export default defineContentConfig({
  collections: {
    lessons: defineCollection({
      type: 'page',
      source: 'lessons/*.md',
      schema: z.object({
        order: z.number(),
        slug: z.string(),
        title: z.string(),
        title_en: z.string(),
        icon: z.string(),
        track: z.enum(['foundation', 'io', 'comm', 'analog', 'pro', 'capstone']),
        level: z.enum(['beginner', 'intermediate', 'advanced']),
        minutes: z.number(),
        tags: z.array(z.string())
      })
    })
  }
})
