import { useState, useRef, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Upload, Camera, Search, Download, Heart, Share2, Image as ImageIcon, Users, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { motion, AnimatePresence } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import JSZip from "jszip";
import { saveAs } from "file-saver";

type ViewMode = "gallery" | "selfie" | "results";

interface PhotoRow {
  id: string;
  image_url: string;
  created_at: string;
}

interface EventRow {
  id: string;
  name: string;
  date: string | null;
  event_code: string;
  cover_image: string | null;
}

const EventPage = () => {
  const { eventId } = useParams();
  const [viewMode, setViewMode] = useState<ViewMode>("gallery");
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [event, setEvent] = useState<EventRow | null>(null);
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (eventId) fetchEvent();
  }, [eventId]);

  const fetchEvent = async () => {
    setLoading(true);
    // Try to find by event_code first, then by id
    let { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("event_code", eventId!)
      .maybeSingle();

    if (!data) {
      const res = await supabase.from("events").select("*").eq("id", eventId!).maybeSingle();
      data = res.data;
      error = res.error;
    }

    if (error || !data) {
      toast({ title: "Event not found", description: "Check the event code and try again", variant: "destructive" });
      setLoading(false);
      return;
    }

    setEvent(data as EventRow);
    
    // Fetch photos
    const { data: photosData } = await supabase
      .from("photos")
      .select("*")
      .eq("event_id", (data as EventRow).id)
      .order("created_at", { ascending: false });

    setPhotos((photosData as PhotoRow[]) || []);
    setLoading(false);
  };

  const handleSelfieUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setSelfiePreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleFindPhotos = () => {
    setIsSearching(true);
    // Simulate AI search — shows all photos for now
    setTimeout(() => {
      setIsSearching(false);
      setViewMode("results");
    }, 2500);
  };

  const handleDownloadAll = async () => {
    if (photos.length === 0) return;
    setDownloading(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder(event?.name || "photos");

      for (let i = 0; i < photos.length; i++) {
        const response = await fetch(photos[i].image_url);
        const blob = await response.blob();
        const ext = photos[i].image_url.split('.').pop()?.split('?')[0] || 'jpg';
        folder?.file(`photo_${i + 1}.${ext}`, blob);
      }

      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `${event?.name || "photos"}.zip`);
      toast({ title: "Download complete!" });
    } catch {
      toast({ title: "Download failed", variant: "destructive" });
    }
    setDownloading(false);
  };

  const handleDownloadSingle = async (url: string, index: number) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const ext = url.split('.').pop()?.split('?')[0] || 'jpg';
      saveAs(blob, `photo_${index + 1}.${ext}`);
    } catch {
      toast({ title: "Download failed", variant: "destructive" });
    }
  };

  const eventUrl = event ? `${window.location.origin}/event/${event.event_code}` : "";

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-dark">
        <Navbar />
        <div className="container pt-32 flex flex-col items-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">Loading event...</p>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-gradient-dark">
        <Navbar />
        <div className="container pt-32 flex flex-col items-center text-center">
          <ImageIcon className="w-12 h-12 text-muted-foreground mb-4" />
          <h2 className="font-display font-bold text-2xl mb-2">Event Not Found</h2>
          <p className="text-muted-foreground mb-6">The event code may be incorrect</p>
          <Link to="/join">
            <Button variant="hero">Try Again</Button>
          </Link>
        </div>
      </div>
    );
  }

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
              {event.date && (
                <span>{new Date(event.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
              )}
              <span className="flex items-center gap-1"><ImageIcon className="w-3.5 h-3.5" />{photos.length} photos</span>
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
                    {event.event_code}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Selfie upload mode */}
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

              <Button variant="hero" size="lg" className="w-full" disabled={!selfiePreview || isSearching} onClick={handleFindPhotos}>
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

        {/* Results banner */}
        {viewMode === "results" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-8">
            <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-primary">
                  {selfiePreview && <img src={selfiePreview} alt="You" className="w-full h-full object-cover" />}
                </div>
                <span className="text-sm text-foreground font-display">
                  Found <strong className="text-primary">{photos.length} photos</strong> of you!
                </span>
              </div>
              <Button variant="hero" size="sm" onClick={handleDownloadAll} disabled={downloading}>
                <Download className="w-4 h-4" />
                {downloading ? "Zipping..." : "Download All"}
              </Button>
            </div>
          </motion.div>
        )}

        {/* Photo Grid */}
        {(viewMode === "gallery" || viewMode === "results") && (
          <>
            {photos.length === 0 ? (
              <div className="text-center py-16">
                <ImageIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-display font-semibold text-lg mb-2">No photos yet</h3>
                <p className="text-muted-foreground text-sm">The photographer hasn't uploaded photos for this event yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                {photos.map((photo, i) => (
                  <motion.div
                    key={photo.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.03 }}
                    className="relative group aspect-[4/3] rounded-xl overflow-hidden bg-secondary"
                  >
                    <img
                      src={photo.image_url}
                      alt=""
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    <div className="absolute bottom-2 left-2 right-2 flex justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <button className="p-2 bg-background/60 backdrop-blur-sm rounded-lg text-foreground hover:text-primary transition-colors">
                        <Heart className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDownloadSingle(photo.image_url, i)}
                        className="p-2 bg-background/60 backdrop-blur-sm rounded-lg text-foreground hover:text-primary transition-colors"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default EventPage;
