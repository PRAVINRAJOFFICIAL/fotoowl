import { useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { Upload, Camera, Search, Download, Heart, Share2, Image as ImageIcon, Users, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { motion, AnimatePresence } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";

type ViewMode = "gallery" | "selfie" | "results";

const EventPage = () => {
  const { eventId } = useParams();
  const [viewMode, setViewMode] = useState<ViewMode>("gallery");
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mock data
  const event = {
    name: "Sarah & John's Wedding",
    date: "2024-03-15",
    code: eventId || "WEDDING2024",
    photoCount: 487,
    guestCount: 124,
  };

  const mockPhotos = Array.from({ length: 12 }, (_, i) => ({
    id: `photo-${i}`,
    url: `https://picsum.photos/seed/${i + 10}/400/300`,
    liked: false,
  }));

  const handleSelfieUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setSelfiePreview(ev.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFindPhotos = () => {
    setIsSearching(true);
    setTimeout(() => {
      setIsSearching(false);
      setViewMode("results");
    }, 2500);
  };

  const eventUrl = `${window.location.origin}/event/${event.code}`;

  return (
    <div className="min-h-screen bg-gradient-dark">
      <Navbar />
      <div className="container pt-20 pb-16">
        {/* Event Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8 pt-4">
          <div>
            <Link to="/" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground text-sm mb-3 font-display">
              <ArrowLeft className="w-4 h-4" /> Back
            </Link>
            <h1 className="font-display font-bold text-2xl md:text-4xl text-foreground">{event.name}</h1>
            <div className="flex items-center gap-4 text-muted-foreground text-sm mt-2">
              <span>{new Date(event.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
              <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{event.guestCount} guests</span>
              <span className="flex items-center gap-1"><ImageIcon className="w-3.5 h-3.5" />{event.photoCount} photos</span>
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="glass" size="sm" onClick={() => setShowQR(!showQR)}>
              <Share2 className="w-4 h-4" />
              Share
            </Button>
            <Button variant="hero" size="sm" onClick={() => setViewMode("selfie")}>
              <Camera className="w-4 h-4" />
              Find My Photos
            </Button>
          </div>
        </div>

        {/* QR Code popup */}
        <AnimatePresence>
          {showQR && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-8 overflow-hidden"
            >
              <div className="bg-gradient-card border border-border rounded-2xl p-8 flex flex-col md:flex-row items-center gap-8">
                <div className="bg-foreground p-4 rounded-xl">
                  <QRCodeSVG value={eventUrl} size={160} />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-lg text-foreground mb-2">Share this Event</h3>
                  <p className="text-muted-foreground text-sm mb-3">Guests can scan this QR code or use the event code to join</p>
                  <div className="bg-secondary text-foreground font-display font-bold tracking-widest text-xl px-6 py-3 rounded-xl inline-block">
                    {event.code}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* View modes */}
        {viewMode === "selfie" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-md mx-auto mb-12">
            <div className="bg-gradient-card border border-border rounded-2xl p-8 shadow-card">
              <h2 className="font-display font-semibold text-xl text-foreground mb-2 text-center">Upload Your Selfie</h2>
              <p className="text-muted-foreground text-sm text-center mb-6">Our AI will find all photos where you appear</p>

              {selfiePreview ? (
                <div className="relative mb-6">
                  <img src={selfiePreview} alt="Your selfie" className="w-48 h-48 mx-auto rounded-2xl object-cover border-2 border-primary/30" />
                  <button
                    onClick={() => { setSelfiePreview(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                    className="absolute top-2 right-2 bg-background/80 rounded-full p-1 text-foreground"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-48 h-48 mx-auto border-2 border-dashed border-border rounded-2xl cursor-pointer hover:border-primary/50 transition-colors mb-6">
                  <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                  <span className="text-sm text-muted-foreground">Upload selfie</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="user"
                    className="hidden"
                    onChange={handleSelfieUpload}
                  />
                </label>
              )}

              <Button
                variant="hero"
                size="lg"
                className="w-full"
                disabled={!selfiePreview || isSearching}
                onClick={handleFindPhotos}
              >
                {isSearching ? (
                  <>
                    <Search className="w-5 h-5 animate-pulse" />
                    Searching with AI...
                  </>
                ) : (
                  <>
                    <Search className="w-5 h-5" />
                    Find My Photos
                  </>
                )}
              </Button>

              <Button variant="ghost" size="sm" className="w-full mt-3" onClick={() => setViewMode("gallery")}>
                Back to Gallery
              </Button>
            </div>
          </motion.div>
        )}

        {viewMode === "results" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-8">
            <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-primary">
                  {selfiePreview && <img src={selfiePreview} alt="You" className="w-full h-full object-cover" />}
                </div>
                <span className="text-sm text-foreground font-display">
                  Found <strong className="text-primary">8 photos</strong> of you!
                </span>
              </div>
              <Button variant="hero" size="sm">
                <Download className="w-4 h-4" />
                Download All
              </Button>
            </div>
          </motion.div>
        )}

        {/* Photo Grid */}
        {(viewMode === "gallery" || viewMode === "results") && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {mockPhotos.map((photo, i) => (
              <motion.div
                key={photo.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                className="relative group aspect-[4/3] rounded-xl overflow-hidden bg-secondary"
              >
                <img
                  src={photo.url}
                  alt=""
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="absolute bottom-2 left-2 right-2 flex justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <button className="p-2 bg-background/60 backdrop-blur-sm rounded-lg text-foreground hover:text-primary transition-colors">
                    <Heart className="w-4 h-4" />
                  </button>
                  <button className="p-2 bg-background/60 backdrop-blur-sm rounded-lg text-foreground hover:text-primary transition-colors">
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default EventPage;
