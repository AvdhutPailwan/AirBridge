import { NextResponse } from 'next/server';
import { getDevice, setDevice, deleteDevice, getAllActiveDevices } from '@/lib/store';

export async function POST(request: Request) {
  try {
    const { id, name, action, targetId, code, senderName, fileCount } = await request.json();

    if (action === 'register') {
      const existing = await getDevice(id);
      await setDevice(id, {
        id,
        name,
        lastSeen: Date.now(),
        pendingRequest: existing?.pendingRequest
      });
      
      const pending = existing?.pendingRequest;

      // Return all OTHER active devices
      const activeDevices = await getAllActiveDevices();
      const otherDevices = activeDevices.filter(d => d.id !== id);
      
      return NextResponse.json({ devices: otherDevices, pendingRequest: pending });
    }

    if (action === 'clear_request') {
      const existing = await getDevice(id);
      if (existing) {
        await setDevice(id, { ...existing, pendingRequest: undefined, lastSeen: Date.now() });
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'push_code') {
      const target = await getDevice(targetId);
      if (target) {
        target.pendingRequest = { code, senderName, fileCount };
        await setDevice(targetId, target);
        return NextResponse.json({ success: true });
      }
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    if (action === 'unregister') {
      await deleteDevice(id);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
