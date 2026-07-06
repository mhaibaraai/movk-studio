import { db, schema } from 'hub:db'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

defineRouteMeta({
  openAPI: {
    description: 'Upsert or clear a vote on an assistant message.',
    tags: ['copilot']
  }
})

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const userId = session.user?.id || session.id

  const { id } = await getValidatedRouterParams(event, z.object({
    id: z.string()
  }).parse)

  const { messageId, isUpvoted } = await readValidatedBody(event, z.object({
    messageId: z.string(),
    isUpvoted: z.boolean().optional()
  }).parse)

  // 归属校验：会话不存在或非本人 → 404（IDOR）
  const chat = await db.query.chats.findFirst({
    where: () => and(eq(schema.chats.id, id), eq(schema.chats.userId, userId))
  })
  if (!chat) {
    throw createError({ statusCode: 404, statusMessage: 'Chat not found' })
  }

  // 消息须属于本会话，防跨会话投票
  const message = await db.query.messages.findFirst({
    where: () => and(eq(schema.messages.id, messageId), eq(schema.messages.chatId, id))
  })
  if (!message) {
    throw createError({ statusCode: 404, statusMessage: 'Message not found' })
  }
  if (message.role !== 'assistant') {
    throw createError({ statusCode: 400, statusMessage: 'Can only vote on assistant messages' })
  }

  // isUpvoted 缺省表示取消投票，否则写入/覆盖
  if (isUpvoted === undefined) {
    await db.delete(schema.votes).where(
      and(eq(schema.votes.chatId, id), eq(schema.votes.messageId, messageId))
    )
  } else {
    await db.insert(schema.votes).values({
      chatId: id,
      messageId,
      isUpvoted
    }).onConflictDoUpdate({
      target: [schema.votes.chatId, schema.votes.messageId],
      set: { isUpvoted }
    })
  }

  return { chatId: id, messageId, isUpvoted }
})
