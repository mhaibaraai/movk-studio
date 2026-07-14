export default defineMcpTool({
  ...mcpToolFrom('buffer-circle'),
  handler: input => ({ ...input, circleId: crypto.randomUUID() })
})
