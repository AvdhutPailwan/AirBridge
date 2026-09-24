export interface Session {
  id: string; // The 6-digit code
  offer?: any;
  answer?: any;
  senderCandidates: any[];
  receiverCandidates: any[];
  status: 'waiting' | 'connected';
  createdAt: number;
}

// Use a global variable to persist the store across Next.js dev server hot reloads
const globalForStore = globalThis as unknown as {
  sessions: Map<string, Session>;
};

export const sessions = globalForStore.sessions || new Map<string, Session>();

if (process.env.NODE_ENV !== 'production') {
  globalForStore.sessions = sessions;
}
