import { db, schema } from 'hub:db'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const userId = session.user?.id || session.id

  const { id } = await getValidatedRouterParams(event, z.object({
    id: z.string()
  }).parse)

  const { title } = await readValidatedBody(event, z.object({
    title: z.string().trim().min(1).max(100)
  }).parse)

  const [chat] = await db.update(schema.chats)
    .set({ title })
    .where(and(eq(schema.chats.id, id), eq(schema.chats.userId, userId)))
    .returning()

  if (!chat) {
    throw createError({ statusCode: 404, statusMessage: 'Chat not found' })
  }

  return chat
})
