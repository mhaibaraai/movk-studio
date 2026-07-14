export default defineMcpTool({
  ...mcpToolFrom('add-cluster'),
  handler: input => ({ ...input, clusterId: crypto.randomUUID() })
})
