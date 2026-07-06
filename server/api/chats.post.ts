import { db, schema } from 'hub:db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

defineRouteMeta({
  openAPI: {
    description: 'Create a workspace chat shell before streaming.',
    tags: ['copilot']
  }
})

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const userId = session.user?.id || session.id

  const { id, workspace } = await readValidatedBody(event, z.object({
    id: z.string(),
    workspace: z.enum(WORKSPACES)
  }).parse)

  // 建会话壳，幂等：已存在则校验归属后直接返回，避免重复建壳报错并防占用他人会话 id
  const existing = await db.query.chats.findFirst({
    where: () => eq(schema.chats.id, id)
  })
  if (existing) {
    if (existing.userId !== userId) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
    }
    return existing
  }

  const [chat] = await db.insert(schema.chats).values({
    id,
    title: '',
    userId,
    workspace
  }).returning()
  if (!chat) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create chat' })
  }

  return chat
})
