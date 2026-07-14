export default defineMcpTool({
  ...mcpToolFrom('export-table-code'),
  handler: input => ({ fileName: input.fileName ?? 'data-table' })
})
