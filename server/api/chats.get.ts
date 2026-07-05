import { db, schema } from 'hub:db'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const userId = session.user?.id || session.id

  const { workspace } = await getValidatedQuery(event, z.object({
    workspace: z.enum(WORKSPACES).optional()
  }).parse)

  return await db.query.chats.findMany({
    where: () => and(
      eq(schema.chats.userId, userId),
      workspace ? eq(schema.chats.workspace, workspace) : undefined
    ),
    columns: {
      id: true,
      title: true,
      workspace: true,
      createdAt: true
    },
    orderBy: () => desc(schema.chats.createdAt)
  })
})
