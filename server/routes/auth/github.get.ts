import { db, schema } from 'hub:db'
import { and, eq } from 'drizzle-orm'
import { type H3Event, send } from 'h3'

function closePopup(event: H3Event) {
  return send(event, '<!DOCTYPE html><html><body><script>window.close()</script></body></html>', 'text/html')
}

export default defineOAuthGitHubEventHandler({
  async onSuccess(event, { user: ghUser }) {
    try {
      const session = await getUserSession(event)

      let user = await db.query.users.findFirst({
        where: () => and(
          eq(schema.users.provider, 'github'),
          eq(schema.users.providerId, ghUser.id.toString())
        )
      })
      if (!user) {
        [user] = await db.insert(schema.users).values({
          id: session.id,
          name: ghUser.name || '',
          email: ghUser.email || '',
          avatar: ghUser.avatar_url || '',
          username: ghUser.login,
          provider: 'github',
          providerId: ghUser.id.toString()
        }).returning()
      } else {
        // Assign anonymous chats with session id to user
        await db.update(schema.chats).set({
          userId: user.id
        }).where(eq(schema.chats.userId, session.id))
      }

      await setUserSession(event, { user })
    } catch (error) {
      console.error('GitHub OAuth callback failed:', error)
    }

    return closePopup(event)
  },
  // Optional, will return a json error and 401 status code by default
  onError(event, error) {
    console.error('GitHub OAuth error:', error)
    return closePopup(event)
  }
})
