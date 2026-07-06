import { db, schema } from 'hub:db'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const userId = session.user?.id || session.id

  const { id } = await getValidatedRouterParams(event, z.object({
    id: z.string()
  }).parse)

  // messages / votes 由 schema 的 onDelete: 'cascade' 自动清除
  const [chat] = await db.delete(schema.chats)
    .where(and(eq(schema.chats.id, id), eq(schema.chats.userId, userId)))
    .returning()

  if (!chat) {
    throw createError({ statusCode: 404, statusMessage: 'Chat not found' })
  }

  return { success: true }
})
