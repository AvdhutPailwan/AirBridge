"use client";

import React, { useState, useEffect, useRef } from "react";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";
import { Input } from "@workspace/ui/components/input";
import { Badge } from "@workspace/ui/components/badge";
import { Separator } from "@workspace/ui/components/separator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@workspace/ui/components/dialog";
import { UploadCloud, File, Smartphone, Laptop, CheckCircle2, Loader2, Wifi } from "lucide-react";
import { useWebRTC } from "../hooks/useWebRTC";

export interface ExtendedFile {
  file: File;
  path: string;
}

export function TransferUI() {
  const [activeTab, setActiveTab] = useState("send");
  const [selectedFiles, setSelectedFiles] = useState<ExtendedFile[]>([]);
  const [receiveCodeInput, setReceiveCodeInput] = useState("");
  
  const {
    status,
    progress,
    pairingCode,
    errorMsg,
    startSender,
    startReceiver,
    reset,
    finalFileName
  } = useWebRTC();

  const [nearbyDevices, setNearbyDevices] = useState<any[]>([]);
  const [pendingRequest, setPendingRequest] = useState<any>(null);
  const deviceIdRef = useRef<string>('');
  const deviceNameRef = useRef<string>('');

  useEffect(() => {
    if (!deviceIdRef.current) {
      deviceIdRef.current = Math.random().toString(36).substring(2, 15);
    }
    
    if (!deviceNameRef.current) {
      const ua = navigator.userAgent;
      let name = "Unknown Device";
      if (/android/i.test(ua)) name = "Android Device";
      else if (/iphone|ipad|ipod/i.test(ua)) name = "iOS Device";
      else if (/mac/i.test(ua)) name = "MacBook";
      else if (/win/i.test(ua)) name = "Windows PC";
      else if (/linux/i.test(ua)) name = "Linux PC";
      deviceNameRef.current = name;
    }
    
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/presence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            action: 'register', 
            id: deviceIdRef.current, 
            name: deviceNameRef.current 
          })
        });
        const data = await res.json();
        
        if (data.devices) {
          setNearbyDevices(data.devices);
        }
        
        if (data.pendingRequest && status === 'idle' && !pendingRequest) {
          setPendingRequest(data.pendingRequest);
        }
      } catch (e) {}
    }, 3000);
    
    return () => clearInterval(interval);
  }, [activeTab, status, startReceiver]);


  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files).map(file => ({
        file,
        path: file.webkitRelativePath || file.name
      }));
      setSelectedFiles(prev => [...prev, ...files]);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (!e.dataTransfer.items) return;

    const items = e.dataTransfer.items;
    const files: ExtendedFile[] = [];

    const traverseFileTree = async (item: any, path: string = "") => {
      return new Promise<void>((resolve) => {
        if (item.isFile) {
          item.file((file: File) => {
            files.push({ file, path: path + file.name });
            resolve();
          });
        } else if (item.isDirectory) {
          const dirReader = item.createReader();
          dirReader.readEntries(async (entries: any[]) => {
            for (let i = 0; i < entries.length; i++) {
              await traverseFileTree(entries[i], path + item.name + "/");
            }
            resolve();
          });
        } else {
          resolve();
        }
      });
    };

    const promises = [];
    for (let i = 0; i < items.length; i++) {
      const itemNode = items[i];
      if (itemNode) {
        const item = itemNode.webkitGetAsEntry();
        if (item) {
          promises.push(traverseFileTree(item));
        }
      }
    }

    await Promise.all(promises);
    setSelectedFiles(prev => [...prev, ...files]);
  };

  const handleStartSend = () => {
    if (selectedFiles.length > 0) {
      startSender(selectedFiles, undefined, deviceNameRef.current);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        const activeElem = document.activeElement as HTMLInputElement;
        if (activeElem?.tagName === 'TEXTAREA' || (activeElem?.tagName === 'INPUT' && activeElem?.type === 'text')) {
          return; // Let inputs handle their own enter
        }

        if (pendingRequest?.code) {
          e.preventDefault();
          setActiveTab("receive");
          startReceiver(pendingRequest.code);
          handleClearRequest();
          return;
        }

        if (activeTab === 'send' && selectedFiles.length > 0 && status === 'idle') {
          e.preventDefault();
          handleStartSend();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, selectedFiles, status, pendingRequest]);

  const handleClearRequest = async () => {
    await fetch('/api/presence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clear_request', id: deviceIdRef.current })
    });
    setPendingRequest(null);
  };

  const renderStatus = () => {
    if (status === 'error') {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
          <div className="bg-destructive/10 p-4 rounded-full">
            <Smartphone className="size-12 text-destructive" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-destructive">Connection Failed</h3>
            <p className="text-muted-foreground mt-2">{errorMsg}</p>
          </div>
          <Button onClick={reset} variant="outline" className="mt-4">Try Again</Button>
        </div>
      );
    }

    if (status === 'completed') {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
          <div className="bg-green-500/10 p-4 rounded-full">
            <CheckCircle2 className="size-16 text-green-500" />
          </div>
          <div>
            <h3 className="text-2xl font-bold">Transfer Complete!</h3>
            <p className="text-muted-foreground mt-2">All files have been successfully transferred.</p>
          </div>
          {finalFileName && activeTab === 'receive' && (
            <div className="mt-4 p-4 bg-muted/50 rounded-lg max-w-sm text-left border border-border">
              <p className="text-sm font-semibold text-foreground mb-1">File Saved As:</p>
              <p className="text-sm font-mono text-[#71C9CE] break-all">{finalFileName}</p>
              <p className="text-xs text-muted-foreground mt-3 italic leading-relaxed">
                Note: Because AirBridge streams massive files securely without crashing your browser, it writes directly to your disk. Due to browser security restrictions, the exact folder path is hidden and it does not appear in your Downloads history. Please check the folder you selected!
              </p>
            </div>
          )}
          <Button onClick={() => { setSelectedFiles([]); setReceiveCodeInput(""); reset(); }} className="mt-4 bg-[#71C9CE] hover:bg-[#5bb7bc] text-white">
            Send More Files
          </Button>
        </div>
      );
    }

    if (status === 'transferring' || status === 'awaiting-approval') {
      return (
        <div className="flex flex-col items-center justify-center py-12 space-y-6">
          <Loader2 className="size-12 animate-spin text-[#71C9CE]" />
          <div className="text-center w-full max-w-sm">
            <h3 className="text-xl font-bold mb-2">
              {status === 'awaiting-approval' ? 'Waiting for Receiver...' : 'Transferring...'}
            </h3>
            {status === 'transferring' && (
              <div className="w-full bg-muted rounded-full h-3 mt-4 overflow-hidden">
                <div 
                  className="bg-[#71C9CE] h-full transition-all duration-300 ease-out" 
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
            {status === 'transferring' && <p className="text-sm text-muted-foreground mt-2">{progress.toFixed(1)}% Completed</p>}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <Card className="border-border bg-card/80 backdrop-blur-2xl shadow-2xl overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#A6E3E9] to-[#71C9CE]"></div>
        
        {status !== 'idle' ? (
          <CardContent className="pt-12">
            {renderStatus()}
            {status === 'waiting' && (
              <div className="flex flex-col items-center justify-center py-8 space-y-6">
                <div className="text-center space-y-2">
                  <h3 className="text-xl font-semibold">Ready to connect</h3>
                  <p className="text-sm text-muted-foreground">Ask the receiver to enter this code:</p>
                </div>
                <div className="text-6xl font-black tracking-widest text-[#71C9CE] font-mono bg-muted/50 px-8 py-4 rounded-2xl border border-border/50 shadow-inner">
                  {pairingCode}
                </div>
                <div className="pt-4 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Waiting for connection...
                </div>
                <Button onClick={reset} variant="ghost" className="mt-4">Cancel</Button>
              </div>
            )}
            {status === 'creating' && (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="size-10 animate-spin text-[#71C9CE] mb-4" />
                <p>Generating secure pairing code...</p>
              </div>
            )}
            {status === 'connecting' && (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="size-10 animate-spin text-[#71C9CE] mb-4" />
                <p>Establishing peer-to-peer connection...</p>
              </div>
            )}
          </CardContent>
        ) : (
          <>
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-3xl font-bold tracking-tight">AirBridge</CardTitle>
              <CardDescription className="text-base mt-2">
                Lightning fast peer-to-peer file transfer. No limits. No data usage.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <Tabs defaultValue="send" value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-8 h-12">
                  <TabsTrigger value="send" className="text-base h-full">Send</TabsTrigger>
                  <TabsTrigger value="receive" className="text-base h-full">Receive</TabsTrigger>
                </TabsList>

                {/* SEND TAB */}
                <TabsContent value="send" className="space-y-6">
                  {selectedFiles.length === 0 ? (
                    <div 
                      className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-10 text-center hover:bg-muted/50 transition-colors group"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={handleDrop}
                    >
                      <div className="flex justify-center mb-4 text-muted-foreground group-hover:text-[#71C9CE] transition-colors">
                        <UploadCloud className="size-16" />
                      </div>
                      <h3 className="text-lg font-semibold mb-1">Drag & drop files or folders here</h3>
                      <p className="text-sm text-muted-foreground mb-6">or use the buttons below</p>
                      
                      <div className="flex items-center justify-center gap-3">
                        <label className="cursor-pointer bg-background border border-border px-4 py-2 rounded-lg text-sm font-medium hover:border-[#71C9CE]/50 hover:text-[#71C9CE] transition-all shadow-sm">
                          Select Files
                          <input type="file" multiple className="hidden" onChange={handleFileSelect} />
                        </label>
                        <label className="cursor-pointer bg-background border border-border px-4 py-2 rounded-lg text-sm font-medium hover:border-[#71C9CE]/50 hover:text-[#71C9CE] transition-all shadow-sm">
                          Select Folder
                          <input type="file" {...({ webkitdirectory: "true", directory: "true" } as any)} className="hidden" onChange={handleFileSelect} />
                        </label>
                      </div>

                      <p className="text-xs text-muted-foreground mt-6 font-medium">Supports &gt;10GB transfers</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="bg-muted/50 rounded-lg p-4 max-h-[200px] overflow-y-auto border border-border">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm font-medium">{selectedFiles.length} file(s) selected</span>
                          <Button variant="ghost" size="sm" onClick={() => setSelectedFiles([])} className="h-auto py-1 text-xs hover:text-[#71C9CE]">Clear</Button>
                        </div>
                        {selectedFiles.slice(0, 5).map((item: any, i) => {
                          const actualFile = item.file || item;
                          const path = item.path || actualFile.name;
                          return (
                            <div key={i} className="flex items-center gap-3 py-2 text-sm text-muted-foreground">
                              <File className="size-4 shrink-0" />
                              <span className="truncate flex-1" title={path}>{path}</span>
                              <span className="shrink-0">{(actualFile.size / (1024 * 1024)).toFixed(2)} MB</span>
                            </div>
                          );
                        })}
                        {selectedFiles.length > 5 && (
                          <div className="text-xs text-center text-muted-foreground mt-2">
                            + {selectedFiles.length - 5} more files
                          </div>
                        )}
                      </div>
                      
                      <div className="pt-4 pb-2">
                        <p className="text-sm font-medium mb-3 flex items-center gap-2">
                          <Loader2 className="size-4 animate-spin text-[#71C9CE]" />
                          Scanning nearby devices...
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          {nearbyDevices.map(device => (
                            <Button 
                              key={device.id}
                              variant="outline" 
                              className="justify-start gap-3 h-14 border-border hover:border-[#71C9CE]/50 hover:bg-[#71C9CE]/5 transition-all"
                              onClick={() => startSender(selectedFiles, device.id, deviceNameRef.current)}
                            >
                              {device.name.includes("Mac") || device.name.includes("PC") ? (
                                <Laptop className="size-5 text-[#71C9CE] shrink-0" />
                              ) : (
                                <Smartphone className="size-5 text-[#71C9CE] shrink-0" />
                              )}
                              <div className="flex flex-col items-start overflow-hidden w-full">
                                <span className="text-foreground truncate w-full text-left">{device.name}</span>
                                <span className="text-xs text-muted-foreground font-normal">Tap to send</span>
                              </div>
                            </Button>
                          ))}
                          {nearbyDevices.length === 0 && (
                            <p className="text-xs text-muted-foreground col-span-2 text-center py-2">No nearby devices found. Make sure the receiver has this site open.</p>
                          )}
                        </div>
                      </div>

                      <Button onClick={handleStartSend} className="w-full h-12 text-lg bg-[#71C9CE] hover:bg-[#5bb7bc] text-white mt-2">
                        Generate Pairing Code
                      </Button>
                    </div>
                  )}
                </TabsContent>

                {/* RECEIVE TAB */}
                <TabsContent value="receive" className="space-y-6">
                  <div className="flex flex-col items-center justify-center py-8 space-y-6">
                    <div className="bg-[#71C9CE]/10 p-6 rounded-full">
                      <Smartphone className="size-16 text-[#71C9CE]" />
                    </div>
                    <div className="text-center space-y-2">
                      <h3 className="text-xl font-semibold">Ready to receive</h3>
                      <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                        Enter the 6-digit code shown on the sender's screen to connect and accept files.
                      </p>
                    </div>
                    <div className="w-full max-w-xs space-y-4 pt-4">
                      <Input 
                        type="text" 
                        placeholder="Enter 6-digit code" 
                        className="text-center text-2xl tracking-widest h-14 font-mono font-bold bg-background"
                        maxLength={6}
                        value={receiveCodeInput}
                        onChange={(e) => setReceiveCodeInput(e.target.value.replace(/\D/g, ''))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && receiveCodeInput.length === 6) {
                            startReceiver(receiveCodeInput);
                          }
                        }}
                      />
                      <Button onClick={() => startReceiver(receiveCodeInput)} className="w-full h-12 text-lg bg-[#71C9CE] hover:bg-[#5bb7bc] text-white" disabled={receiveCodeInput.length !== 6}>
                        Connect
                      </Button>
                    </div>

                    <div className="w-full max-w-sm bg-[#71C9CE]/10 border border-[#71C9CE]/20 text-[#0d7d82] dark:text-[#71C9CE] p-3 rounded-lg flex items-start gap-3 text-sm mt-4">
                      <Wifi className="size-5 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">Network Check</p>
                        <p className="opacity-90 leading-snug">Make sure you are on the <strong>same Wi-Fi network</strong> or hotspot as the sender.</p>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </>
        )}
      </Card>
      
      <Dialog open={!!pendingRequest} onOpenChange={(open) => {
        if (!open) {
          handleClearRequest();
        }
      }}>
        <DialogContent className="sm:max-w-md border-border bg-card">
          <DialogHeader>
            <DialogTitle>Incoming File Transfer</DialogTitle>
            <DialogDescription>
              <strong className="text-foreground">{pendingRequest?.senderName}</strong> wants to send you {pendingRequest?.fileCount} file(s).
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center p-6 bg-muted/50 rounded-xl my-2">
             <div className="bg-[#71C9CE]/10 p-4 rounded-full">
               <Smartphone className="size-12 text-[#71C9CE]" />
             </div>
          </div>
          <DialogFooter className="sm:justify-between flex-row">
            <Button variant="outline" onClick={handleClearRequest}>
              Decline
            </Button>
            <Button className="bg-[#71C9CE] hover:bg-[#5bb7bc] text-white" onClick={() => {
              if (pendingRequest?.code) {
                setActiveTab("receive");
                startReceiver(pendingRequest.code);
              }
              handleClearRequest();
            }}>
              Accept
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
