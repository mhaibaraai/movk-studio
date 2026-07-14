export default defineMcpTool({
  ...mcpToolFrom('export-form-code'),
  handler: input => ({ fileName: input.fileName ?? 'form-schema' })
})
