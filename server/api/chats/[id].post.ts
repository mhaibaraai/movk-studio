import type { UIMessage } from 'ai'
import { convertToModelMessages, createUIMessageStreamResponse, generateId, generateText, isStepCount, smoothStream, streamText, toUIMessageStream } from 'ai'
import { db, schema } from 'hub:db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

defineRouteMeta({
  openAPI: {
    description: 'Stream a Copilot reply for a workspace chat.',
    tags: ['copilot']
  }
})

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const userId = session.user?.id || session.id

  const { id } = await getValidatedRouterParams(event, z.object({
    id: z.string()
  }).parse)

  const { model, messages, workspaceContext } = await readValidatedBody(event, z.object({
    model: z.string().refine(value => MODELS.some(m => m.value === value), {
      message: 'Invalid model'
    }),
    messages: z.array(z.custom<UIMessage>()),
    // 客户端工作区快照（map 手绘要素 / form 当前表单与已填值）；仅用于拼 system prompt，
    // 形状按工作区在 summarizeWorkspaceContext 内校验
    workspaceContext: z.unknown().optional()
  }).parse)

  // 会话须已由 POST /api/chats 建壳，此处仅流式：不存在 404，非本人 403（IDOR）
  const chat = await db.query.chats.findFirst({
    where: () => eq(schema.chats.id, id)
  })
  if (!chat) {
    throw createError({ statusCode: 404, statusMessage: 'Chat not found' })
  }
  if (chat.userId !== userId) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  // 落库最新一条用户消息（重发/编辑用 upsert 覆盖 parts）
  const lastMessage = messages[messages.length - 1]
  if (lastMessage?.role === 'user') {
    // 防跨会话篡改：客户端提供的消息 id 若已属于其它会话则拒绝
    const existing = await db.query.messages.findFirst({
      where: () => eq(schema.messages.id, lastMessage.id),
      columns: { chatId: true }
    })
    if (existing && existing.chatId !== id) {
      throw createError({ statusCode: 403, statusMessage: 'Message does not belong to this chat' })
    }

    await db.insert(schema.messages).values({
      id: lastMessage.id,
      chatId: id,
      role: 'user',
      parts: lastMessage.parts
    }).onConflictDoUpdate({
      target: schema.messages.id,
      set: { parts: lastMessage.parts },
      setWhere: eq(schema.messages.chatId, id)
    })
  }

  // 首条消息后生成标题
  if (!chat.title) {
    const { text: title } = await generateText({
      model: resolveModel(model),
      instructions: TITLE_INSTRUCTIONS,
      prompt: JSON.stringify(messages[0])
    })

    await db.update(schema.chats).set({ title }).where(eq(schema.chats.id, id))
  }

  // res 已正常写完时 req 的 close 事件仍会触发，需排除这种情况，避免误判为客户端提前断开而跳过 onEnd 落库
  const abortController = new AbortController()
  event.node.req.on('close', () => abortController.abort())

  const result = streamText({
    abortSignal: abortController.signal,
    model: resolveModel(model),
    maxOutputTokens: 8000,
    instructions: copilotSystemPrompt(chat.workspace, summarizeWorkspaceContext(chat.workspace, workspaceContext)),
    messages: await convertToModelMessages(messages),
    tools: getToolsForWorkspace(chat.workspace),
    providerOptions: PROVIDER_OPTIONS,
    stopWhen: isStepCount(6),
    experimental_transform: smoothStream(),
    onError: (error) => {
      console.error('streamText error:', error)
    }
  })

  const stream = toUIMessageStream({
    stream: result.stream,
    sendSources: true,
    sendReasoning: true,
    // 服务端生成助手消息 id 并随 start 帧下发，确保与客户端一致且每条唯一（否则落库 id 为空串，投票/编辑按 id 无法命中）
    generateMessageId: generateId,
    onEnd: async ({ responseMessage }) => {
      // 流被中断且无内容时不落库，避免重载出现空消息帧
      if (!responseMessage.parts?.length) return

      await db.insert(schema.messages).values([{
        id: responseMessage.id,
        chatId: id,
        role: responseMessage.role as 'user' | 'assistant',
        parts: responseMessage.parts
      }]).onConflictDoNothing()
    }
  })

  return createUIMessageStreamResponse({ stream })
})
