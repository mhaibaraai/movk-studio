export default defineMcpTool({
  ...mcpToolFrom('add-marker'),
  handler: input => ({ ...input, markerId: crypto.randomUUID() })
})
