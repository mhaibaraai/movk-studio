export default defineMcpTool({
  ...mcpToolFrom('export-image'),
  handler: input => ({ fileName: input.fileName ?? 'map.png' })
})
