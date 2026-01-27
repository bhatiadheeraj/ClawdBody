// Shared session output buffers for terminal streaming
// This is stored in memory and shared across route handlers

export const sessionOutputBuffers = new Map<string, string[]>()
