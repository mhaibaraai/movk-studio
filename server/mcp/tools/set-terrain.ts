export default defineMcpTool({
  ...mcpToolFrom('set-terrain'),
  handler: input => ({ ...input, exaggeration: input.exaggeration ?? 1.5 })
})
