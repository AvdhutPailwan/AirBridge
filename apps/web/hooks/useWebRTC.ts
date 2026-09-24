import { useState, useRef, useEffect } from 'react';
import { Zip, ZipPassThrough } from 'fflate';
import type { ExtendedFile } from '../components/TransferUI';

export type TransferStatus = 'idle' | 'creating' | 'waiting' | 'connecting' | 'awaiting-approval' | 'transferring' | 'completed' | 'error';

const ICE_SERVERS = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
const WEBRTC_CHUNK_SIZE = 64 * 1024;
let DISK_CHUNK_SIZE = 10 * 1024 * 1024; // 10MB default
let MAX_BUFFER = 15 * 1024 * 1024; // 15MB default

if (typeof navigator !== 'undefined') {
  // @ts-ignore
  const memory = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;

  if (memory <= 2 || cores <= 2) {
    // Low-end device
    DISK_CHUNK_SIZE = 2 * 1024 * 1024; // 2MB
    MAX_BUFFER = 4 * 1024 * 1024; // 4MB
  } else if (memory < 8 && cores <= 4) {
    // Mid-range device
    DISK_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
    MAX_BUFFER = 8 * 1024 * 1024; // 8MB
  } else {
    // High-end device
    DISK_CHUNK_SIZE = 10 * 1024 * 1024; // 10MB
    MAX_BUFFER = 15 * 1024 * 1024; // 15MB
  }
}

async function waitForBuffer(channel: RTCDataChannel) {
  if (channel.bufferedAmount < MAX_BUFFER) return;
  return new Promise<void>((resolve) => {
    const listener = () => {
      if (channel.bufferedAmount < MAX_BUFFER) {
        channel.removeEventListener('bufferedamountlow', listener);
        resolve();
      }
    };
    channel.addEventListener('bufferedamountlow', listener);
  });
}

async function waitForDrain(channel: RTCDataChannel) {
  if (channel.bufferedAmount === 0) return;
  return new Promise<void>((resolve) => {
    const prev = channel.bufferedAmountLowThreshold;
    channel.bufferedAmountLowThreshold = 0;
    const listener = () => {
      if (channel.bufferedAmount === 0) {
        channel.removeEventListener('bufferedamountlow', listener);
        channel.bufferedAmountLowThreshold = prev;
        resolve();
      }
    };
    channel.addEventListener('bufferedamountlow', listener);
  });
}

export function useWebRTC() {
  const [status, setStatus] = useState<TransferStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [pairingCode, setPairingCode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [finalFileName, setFinalFileName] = useState('');
  
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const pollingRef = useRef<any>(null);
  const writableRef = useRef<any>(null);
  const fileHandleRef = useRef<any>(null);

  const cleanup = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    if (dcRef.current) dcRef.current.close();
    if (pcRef.current) pcRef.current.close();
    pcRef.current = null;
    dcRef.current = null;
    
    if (writableRef.current) {
      try {
        if (typeof writableRef.current.abort === 'function') {
          const abortPromise = writableRef.current.abort();
          if (abortPromise && abortPromise.catch) {
            abortPromise.catch(() => {});
          }
        }
      } catch (e) {}
    }

    if (fileHandleRef.current) {
      try {
        if (typeof fileHandleRef.current.remove === 'function') {
          const removePromise = fileHandleRef.current.remove();
          if (removePromise && removePromise.catch) {
            removePromise.catch(() => {});
          }
        }
      } catch (e) {}
    }

    writableRef.current = null;
    fileHandleRef.current = null;
  };

  const setupFailSafes = (pc: RTCPeerConnection) => {
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        setStatus(prev => {
          if (prev !== 'completed') {
            setErrorMsg('Connection to the peer was lost.');
            cleanup();
            return 'error';
          }
          return prev;
        });
      }
    };
  };

  const startSender = async (files: ExtendedFile[], targetDeviceId?: string, senderName?: string) => {
    cleanup();
    setStatus('creating');
    try {
      const res = await fetch('/api/signaling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create' })
      });
      const data = await res.json();
      if (!data.code) throw new Error('Failed to get pairing code');
      
      const code = data.code;
      setPairingCode(code);
      setStatus('waiting');


      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;
      setupFailSafes(pc);

      // Handle ICE Candidates
      pc.onicecandidate = async (e) => {
        if (e.candidate) {
          await fetch('/api/signaling', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'candidate', code, role: 'sender', data: e.candidate })
          });
        }
      };

      // Create DataChannel
      const dc = pc.createDataChannel('airbridge', { ordered: true });
      dcRef.current = dc;
      dc.binaryType = 'arraybuffer';
      dc.bufferedAmountLowThreshold = MAX_BUFFER / 2;

      let totalSize = files.reduce((acc, f) => acc + f.file.size, 0);
      const isSingleFile = files.length === 1 && !files[0]?.path.includes('/');
      let fileName = 'AirBridge_Files.zip';
      if (isSingleFile && files[0]) {
        fileName = files[0].file.name;
      } else {
        const d = new Date();
        const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}-${String(d.getMinutes()).padStart(2,'0')}`;
        fileName = `AirBridge_${dateStr}.zip`;
      }
      setFinalFileName(fileName);

      dc.onopen = () => {
        setStatus('awaiting-approval');
        dc.send(JSON.stringify({ type: 'meta', totalSize, isSingleFile, fileName }));
      };

      dc.onmessage = async (e) => {
        if (typeof e.data === 'string') {
          const msg = JSON.parse(e.data);
          if (msg.type === 'ready') {
            setStatus('transferring');
            if (isSingleFile && files[0]) {
              await startStreamingSingleFile(files[0], totalSize, dc);
            } else {
              await startStreamingZip(files, totalSize, dc);
            }
          }
        }
      };

      // Create Offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await fetch('/api/signaling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'offer', code, data: offer })
      });

      // If targeting a specific nearby device, push the code directly to them AFTER the offer is uploaded!
      if (targetDeviceId && senderName) {
        await fetch('/api/presence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'push_code', targetId: targetDeviceId, code, senderName, fileCount: files.length })
        });
      }

      // Poll for Answer and Receiver Candidates
      let answerApplied = false;
      let candidateIndex = 0;
      pollingRef.current = setInterval(async () => {
        const pRes = await fetch(`/api/signaling?code=${code}`);
        const session = await pRes.json();
        
        if (session.answer && !answerApplied) {
          await pc.setRemoteDescription(new RTCSessionDescription(session.answer));
          answerApplied = true;
          setStatus('connecting');
        }
        
        if (answerApplied && session.receiverCandidates.length > candidateIndex) {
          for (let i = candidateIndex; i < session.receiverCandidates.length; i++) {
            await pc.addIceCandidate(new RTCIceCandidate(session.receiverCandidates[i]));
          }
          candidateIndex = session.receiverCandidates.length;
        }
      }, 2000);

    } catch (err: any) {
      setErrorMsg(err.message);
      setStatus('error');
    }
  };

  const startStreamingSingleFile = async (item: ExtendedFile, totalSize: number, dc: RTCDataChannel) => {
    let bytesSent = 0;
    try {
      let offset = 0;
      const size = item.file.size;
      
      while (offset < size) {
        const chunk = await item.file.slice(offset, offset + DISK_CHUNK_SIZE).arrayBuffer();
        const uint8 = new Uint8Array(chunk);
        
        for (let i = 0; i < uint8.length; i += WEBRTC_CHUNK_SIZE) {
          const slice = uint8.slice(i, i + WEBRTC_CHUNK_SIZE);
          dc.send(slice);
          if (dc.bufferedAmount >= MAX_BUFFER) {
            await waitForBuffer(dc);
          }
        }
        
        bytesSent += chunk.byteLength;
        setProgress((bytesSent / totalSize) * 100);
      }
      
      await waitForDrain(dc);
      dc.send(JSON.stringify({ type: 'eof' }));
      setStatus('completed');
    } catch (e: any) {
      console.error(e);
      setStatus('error');
      setErrorMsg('Transfer interrupted or connection lost.');
      cleanup();
    }
  };

  const startStreamingZip = async (files: ExtendedFile[], totalSize: number, dc: RTCDataChannel) => {
    const zip = new Zip();
    let bytesSent = 0;

    zip.ondata = async (err, data, final) => {
      if (err) {
        console.error("Zip Error:", err);
        return;
      }
      for (let i = 0; i < data.length; i += WEBRTC_CHUNK_SIZE) {
        const slice = data.slice(i, i + WEBRTC_CHUNK_SIZE);
        dc.send(slice);
      }
      if (final) {
        await waitForDrain(dc);
        dc.send(JSON.stringify({ type: 'eof' }));
        setStatus('completed');
      }
    };

    try {
      for (const item of files) {
        const f = new ZipPassThrough(item.path);
        zip.add(f);
        
        let offset = 0;
        const size = item.file.size;
        
        while (offset < size) {
          // Read from disk in 25MB chunks
          const chunk = await item.file.slice(offset, offset + DISK_CHUNK_SIZE).arrayBuffer();
          f.push(new Uint8Array(chunk));
          offset += chunk.byteLength;
          bytesSent += chunk.byteLength;
          setProgress((bytesSent / totalSize) * 100);
          
          // Wait for WebRTC buffer to drain to prevent memory crash
          await waitForBuffer(dc);
        }
        f.push(new Uint8Array(0), true);
      }
      zip.end();
    } catch (e: any) {
      setStatus('error');
      setErrorMsg('Transfer interrupted or connection lost.');
      cleanup();
    }
  };

  const startReceiver = async (code: string) => {
    cleanup();
    setStatus('connecting');
    try {
      const pRes = await fetch(`/api/signaling?code=${code}`);
      if (!pRes.ok) throw new Error('Invalid or expired code');
      let session = await pRes.json();

      let retries = 0;
      while (!session.offer && retries < 20) {
        await new Promise(r => setTimeout(r, 500));
        const retryRes = await fetch(`/api/signaling?code=${code}`);
        if (retryRes.ok) session = await retryRes.json();
        retries++;
      }

      if (!session.offer) throw new Error('No offer found. Sender might have disconnected.');

      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;
      setupFailSafes(pc);

      let fileHandle: FileSystemFileHandle | null = null;
      let writable: any = null;
      let receivedBytes = 0;
      let expectedTotal = 0;

      pc.ondatachannel = (e) => {
        const dc = e.channel;
        dcRef.current = dc;
        dc.binaryType = 'arraybuffer';
        
        dc.onmessage = async (event) => {
          if (typeof event.data === 'string') {
            const msg = JSON.parse(event.data);
            if (msg.type === 'meta') {
              expectedTotal = msg.totalSize;
              const fileName = msg.fileName || 'AirBridge_Files.zip';
              setFinalFileName(fileName);
              try {
                let useFallback = true;
                // @ts-ignore
                if (window.showSaveFilePicker && window.isSecureContext) {
                  try {
                    // @ts-ignore
                    fileHandle = await window.showSaveFilePicker({ suggestedName: fileName });
                    fileHandleRef.current = fileHandle;
                    writable = await fileHandle!.createWritable();
                    writableRef.current = writable;
                    useFallback = false;
                  } catch (err: any) {
                    if (err.name === 'AbortError') {
                      setStatus('error');
                      setErrorMsg('Save cancelled by user.');
                      cleanup();
                      return;
                    }
                    // If it failed for a security reason, let it fall through to the fallback
                    console.warn("File System API failed, using fallback:", err);
                  }
                }
                
                if (useFallback) {
                  // Fallback for browsers without File System Access API
                  writable = {
                    chunks: [],
                    write: function(data: any) { this.chunks.push(data) },
                    close: function() {
                      const blob = new Blob(this.chunks);
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = fileName;
                      a.click();
                    },
                    abort: function() {
                      this.chunks = [];
                    }
                  }
                  writableRef.current = writable;
                }
                setStatus('transferring');
                dc.send(JSON.stringify({ type: 'ready' }));
              } catch (e) {
                setStatus('error');
                setErrorMsg('An error occurred while preparing the save location.');
                cleanup();
              }
            } else if (msg.type === 'eof') {
              if (writable) {
                await writable.close();
                writableRef.current = null;
                fileHandleRef.current = null;
              }
              setStatus('completed');
              cleanup();
            }
          } else {
            // Binary chunk received
            const buffer = event.data;
            if (writable) await writable.write(buffer);
            receivedBytes += buffer.byteLength;
            if (expectedTotal > 0) {
              setProgress((receivedBytes / expectedTotal) * 100);
            }
          }
        };
      };

      pc.onicecandidate = async (e) => {
        if (e.candidate) {
          await fetch('/api/signaling', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'candidate', code, role: 'receiver', data: e.candidate })
          });
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(session.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await fetch('/api/signaling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'answer', code, data: answer })
      });

      let candidateIndex = 0;
      pollingRef.current = setInterval(async () => {
        const res = await fetch(`/api/signaling?code=${code}`);
        const s = await res.json();
        if (s.senderCandidates.length > candidateIndex) {
          for (let i = candidateIndex; i < s.senderCandidates.length; i++) {
            await pc.addIceCandidate(new RTCIceCandidate(s.senderCandidates[i]));
          }
          candidateIndex = s.senderCandidates.length;
        }
      }, 2000);

    } catch (err: any) {
      setErrorMsg(err.message);
      setStatus('error');
    }
  };

  return {
    status,
    progress,
    pairingCode,
    errorMsg,
    startSender,
    startReceiver,
    reset: () => {
      cleanup();
      setStatus('idle');
      setProgress(0);
      setPairingCode('');
      setErrorMsg('');
      setFinalFileName('');
    },
    finalFileName
  };
}
