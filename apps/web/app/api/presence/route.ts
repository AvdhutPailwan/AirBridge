import { NextResponse } from 'next/server';

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

const globalForPresence = globalThis as unknown as {
  devices: Map<string, Device>;
};

export const devices = globalForPresence.devices || new Map<string, Device>();

if (process.env.NODE_ENV !== 'production') {
  globalForPresence.devices = devices;
}

export async function POST(request: Request) {
  try {
    const { id, name, action, targetId, code, senderName, fileCount } = await request.json();

    // Clean up dead devices (not seen in 10s)
    const now = Date.now();
    for (const [deviceId, device] of devices.entries()) {
      if (now - device.lastSeen > 10000) {
        devices.delete(deviceId);
      }
    }

    if (action === 'register') {
      const existing = devices.get(id);
      devices.set(id, {
        id,
        name,
        lastSeen: now,
        pendingRequest: existing?.pendingRequest
      });
      
      const pending = existing?.pendingRequest;

      // Return all OTHER devices
      const activeDevices = Array.from(devices.values()).filter(d => d.id !== id);
      return NextResponse.json({ devices: activeDevices, pendingRequest: pending });
    }

    if (action === 'clear_request') {
      const existing = devices.get(id);
      if (existing) {
        devices.set(id, { ...existing, pendingRequest: undefined });
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'push_code') {
      const target = devices.get(targetId);
      if (target) {
        target.pendingRequest = { code, senderName, fileCount };
        return NextResponse.json({ success: true });
      }
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    if (action === 'unregister') {
      devices.delete(id);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
