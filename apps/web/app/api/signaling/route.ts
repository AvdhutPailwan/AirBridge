import { NextResponse } from 'next/server';
import { getSession, setSession } from '@/lib/store';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, code, data, role } = body;
    
    // Create a new session
    if (action === 'create') {
      const newCode = Math.floor(100000 + Math.random() * 900000).toString();
      await setSession(newCode, {
        id: newCode,
        senderCandidates: [],
        receiverCandidates: [],
        status: 'waiting',
        createdAt: Date.now()
      });
      return NextResponse.json({ code: newCode });
    }
    
    if (!code) {
      return NextResponse.json({ error: 'Code is required' }, { status: 400 });
    }

    const session = await getSession(code);
    
    if (!session) {
      return NextResponse.json({ error: 'Session not found or expired' }, { status: 404 });
    }
    
    if (action === 'offer') {
      session.offer = data;
    } else if (action === 'answer') {
      session.answer = data;
      session.status = 'connected';
    } else if (action === 'candidate') {
      if (role === 'sender') {
        session.senderCandidates.push(data);
      } else {
        session.receiverCandidates.push(data);
      }
    }
    
    await setSession(code, session);
    return NextResponse.json({ success: true });
    
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  
  if (!code) {
    return NextResponse.json({ error: 'Code required' }, { status: 400 });
  }
  
  const session = await getSession(code);
  
  if (!session) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  
  return NextResponse.json(session);
}
