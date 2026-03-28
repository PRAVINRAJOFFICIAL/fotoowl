import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { QrCode, ArrowRight, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Navbar from "@/components/Navbar";
import { motion } from "framer-motion";

const JoinEvent = () => {
  const [eventCode, setEventCode] = useState("");
  const navigate = useNavigate();

  const handleJoin = () => {
    if (eventCode.trim()) {
      navigate(`/event/${eventCode.trim()}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-dark">
      <Navbar />
      <div className="container pt-24 pb-16 flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
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
                placeholder="e.g. WEDDING2024"
                value={eventCode}
                onChange={(e) => setEventCode(e.target.value.toUpperCase())}
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground h-12 text-center text-lg font-display tracking-widest"
                onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              />
            </div>

            <Button variant="hero" size="lg" className="w-full" onClick={handleJoin} disabled={!eventCode.trim()}>
              Join Event
              <ArrowRight className="w-5 h-5" />
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-card px-3 text-muted-foreground font-display">or</span>
              </div>
            </div>

            <Button variant="glass" size="lg" className="w-full">
              <Camera className="w-5 h-5" />
              Scan QR Code
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default JoinEvent;
