// Shared session store for all authentication methods
export const sessions = new Map();

// Session duration: 4 hours
export const SESSION_DURATION = 4 * 60 * 60 * 1000;

// Clean expired sessions every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.createdAt > SESSION_DURATION) {
      sessions.delete(sessionId);
    }
  }
}, 30 * 60 * 1000);

// Generate secure session ID
export function generateSessionId() {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15) +
         Date.now().toString(36);
}