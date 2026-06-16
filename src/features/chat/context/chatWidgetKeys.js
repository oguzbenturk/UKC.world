// Shared React Query keys for the chat widget. Kept separate so both the
// provider and the thread component can import them without tripping
// Fast Refresh's "only export components" rule.
export const CONV_KEY = ['chatWidget', 'conversations'];
export const msgKey = (conversationId) => ['chatWidget', 'messages', conversationId];
