import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { QrCode, ArrowRight, Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Navbar from "@/components/Navbar";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const JoinEvent = () => {
  const [eventCode, setEventCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const navigate = useNavigate();

  // Check URL for event_id param (from QR scan redirect)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) {
      setEventCode(code);
      handleJoinWithCode(code);
    }
  }, []);

  const handleJoinWithCode = async (code: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("events")
      .select("id, event_code, status")
      .eq("event_code", code)
      .maybeSingle();

    if (error || !data) {
      toast({ title: "Event not found", description: "Check the code and try again", variant: "destructive" });
      setLoading(false);
      return;
    }

    if ((data as any).status !== "approved") {
      toast({ title: "Event not available", description: "This event has not been approved yet", variant: "destructive" });
      setLoading(false);
      return;
    }

    navigate(`/event/${(data as any).event_code}`);
  };

  const handleJoin = () => {
    const code = eventCode.trim();
    if (!code) return;
    handleJoinWithCode(code);
  };

  const startScanning = async () => {
    setScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        scanFrame();
      }
    } catch {
      toast({ title: "Camera error", description: "Could not access camera", variant: "destructive" });
      setScanning(false);
    }
  };

  const stopScanning = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setScanning(false);
  };

  const scanFrame = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const check = () => {
      if (!streamRef.current) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);

      // Try to detect QR using BarcodeDetector if available
      if ("BarcodeDetector" in window) {
        const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
        detector.detect(canvas).then((barcodes: any[]) => {
          if (barcodes.length > 0) {
            const url = barcodes[0].rawValue;
            stopScanning();
            // Extract event code from URL
            const match = url.match(/\/event\/([A-Z0-9]+)/i);
            if (match) {
              handleJoinWithCode(match[1]);
            } else {
              // Maybe it's just a code
              handleJoinWithCode(url);
            }
            return;
          }
          requestAnimationFrame(check);
        }).catch(() => requestAnimationFrame(check));
      } else {
        requestAnimationFrame(check);
      }
    };
    requestAnimationFrame(check);
  };

  useEffect(() => {
    return () => { stopScanning(); };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-dark">
      <Navbar />
      <div className="container pt-24 pb-16 flex flex-col items-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
          <div className="text-center mb-10">
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <QrCode className="w-8 h-8 text-primary" />
            </div>
            <h1 className="font-display font-bold text-3xl mb-3">Join an Event</h1>
            <p className="text-muted-foreground">Enter the event code or scan the QR code at the venue</p>
          </div>

          <div className="bg-gradient-card border border-border rounded-2xl p-8 shadow-card space-y-6">
            <div>
              <label className="text-sm font-display font-medium text-foreground mb-2 block">Event Code</label>
              <Input
                placeholder="e.g. ABC123"
                value={eventCode}
                onChange={(e) => setEventCode(e.target.value.toUpperCase())}
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground h-12 text-center text-lg font-display tracking-widest"
                onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              />
            </div>

            <Button variant="hero" size="lg" className="w-full" onClick={handleJoin} disabled={!eventCode.trim() || loading}>
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Joining...</> : <>Join Event <ArrowRight className="w-5 h-5" /></>}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
              <div className="relative flex justify-center text-xs"><span className="bg-card px-3 text-muted-foreground font-display">or</span></div>
            </div>

            {!scanning ? (
              <Button variant="glass" size="lg" className="w-full" onClick={startScanning}>
                <Camera className="w-5 h-5" />
                Scan QR Code
              </Button>
            ) : (
              <div className="space-y-4">
                <div className="relative rounded-xl overflow-hidden bg-secondary aspect-square">
                  <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
                  <canvas ref={canvasRef} className="hidden" />
                  <div className="absolute inset-0 border-2 border-primary/50 rounded-xl pointer-events-none" />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-48 h-48 border-2 border-primary rounded-lg" />
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="w-full" onClick={stopScanning}>
                  Stop Scanning
                </Button>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default JoinEvent;
