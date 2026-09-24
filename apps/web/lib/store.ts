import { Redis } from '@upstash/redis';

export interface Session {
  id: string; // The 6-digit code
  offer?: any;
  answer?: any;
  senderCandidates: any[];
  receiverCandidates: any[];
  status: 'waiting' | 'connected';
  createdAt: number;
}

export interface PendingRequest {
  code: string;
  senderName: string;
  fileCount: number;
}

export interface Device {
  id: string;
  name: string;
  lastSeen: number;
  pendingRequest?: PendingRequest;
}

const globalForStore = globalThis as unknown as {
  sessions: Map<string, Session>;
  devices: Map<string, Device>;
};

const localSessions = globalForStore.sessions || new Map<string, Session>();
const localDevices = globalForStore.devices || new Map<string, Device>();

if (process.env.NODE_ENV !== 'production') {
  globalForStore.sessions = localSessions;
  globalForStore.devices = localDevices;
}

// Initialize Redis only if env variables are present
const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN 
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

// --- SESSION METHODS ---
export async function getSession(code: string): Promise<Session | null> {
  if (redis) {
    return await redis.get<Session>(`session:${code}`);
  }
  return localSessions.get(code) || null;
}

export async function setSession(code: string, session: Session): Promise<void> {
  if (redis) {
    // Expire session after 10 minutes automatically
    await redis.set(`session:${code}`, session, { ex: 600 });
  } else {
    localSessions.set(code, session);
  }
}

// --- PRESENCE METHODS ---
export async function getDevice(id: string): Promise<Device | null> {
  if (redis) {
    return await redis.get<Device>(`device:${id}`);
  }
  return localDevices.get(id) || null;
}

export async function setDevice(id: string, device: Device): Promise<void> {
  if (redis) {
    // Expire device presence after 30 seconds
    await redis.set(`device:${id}`, device, { ex: 30 });
  } else {
    localDevices.set(id, device);
  }
}

export async function deleteDevice(id: string): Promise<void> {
  if (redis) {
    await redis.del(`device:${id}`);
  } else {
    localDevices.delete(id);
  }
}

export async function getAllActiveDevices(): Promise<Device[]> {
  if (redis) {
    // Fetch all device keys
    const keys = await redis.keys('device:*');
    if (keys.length === 0) return [];
    
    // mget requires at least one key, already checked
    const devices = await redis.mget<Device[]>(...keys);
    return devices.filter(Boolean) as Device[];
  }
  
  // Local implementation: cleanup stale devices first
  const now = Date.now();
  for (const [deviceId, device] of localDevices.entries()) {
    if (now - device.lastSeen > 10000) {
      localDevices.delete(deviceId);
    }
  }
  return Array.from(localDevices.values());
}
