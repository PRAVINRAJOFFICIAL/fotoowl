import { useState, useRef, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Upload, Camera, Search, Download, Heart, Share2, Image as ImageIcon, ArrowLeft, Loader2, Brain, AlertCircle, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { motion, AnimatePresence } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { matchSelfieViaApi, isFaceApiConfigured } from "@/lib/faceApi";
import { useAuth } from "@/contexts/AuthContext";

type ViewMode = "prompt" | "selfie" | "results" | "admin-gallery";

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
  status: string;
}

const EventPage = () => {
  const { eventId } = useParams();
  const { user, isAdmin } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>("prompt");
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchStatus, setSearchStatus] = useState("");
  const [showQR, setShowQR] = useState(false);
  const [event, setEvent] = useState<EventRow | null>(null);
  const [allPhotos, setAllPhotos] = useState<PhotoRow[]>([]);
  const [matchedPhotos, setMatchedPhotos] = useState<PhotoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [noFaceFound, setNoFaceFound] = useState(false);
  const [hasNotifyRequest, setHasNotifyRequest] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (eventId) fetchEvent();
  }, [eventId]);

  const fetchEvent = async () => {
    setLoading(true);
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

    const eventData = data as EventRow;

    if (eventData.status !== "approved" && !isAdmin) {
      toast({ title: "Event not available", description: "This event is not yet approved", variant: "destructive" });
      setEvent(null);
      setLoading(false);
      return;
    }

    setEvent(eventData);

    const { data: photosData } = await supabase
      .from("photos")
      .select("*")
      .eq("event_id", eventData.id)
      .order("created_at", { ascending: false });

    const photos = (photosData as PhotoRow[]) || [];
    setAllPhotos(photos);

    // Admin bypass: show all photos directly
    if (isAdmin) {
      setMatchedPhotos(photos);
      setViewMode("admin-gallery");
      setLoading(false);
      return;
    }

    // Check if user already has a notify request
    if (user) {
      const { data: reqData } = await supabase
        .from("photo_requests")
        .select("id")
        .eq("event_id", eventData.id)
        .eq("user_id", user.id)
        .maybeSingle();
      setHasNotifyRequest(!!reqData);
    }

    setLoading(false);
  };

  const handleSelfieUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelfieFile(file);
      setNoFaceFound(false);
      const reader = new FileReader();
      reader.onload = (ev) => setSelfiePreview(ev.target?.result as string);
      reader.readAsDataURL(file);
      setViewMode("selfie");
    }
  };

  const handleFindPhotos = async () => {
    if (!selfieFile || !event) return;

    setIsSearching(true);
    setNoFaceFound(false);

    try {
      if (!isFaceApiConfigured()) {
        toast({ title: "Configuration Error", description: "Face recognition API is not configured. Contact the administrator.", variant: "destructive" });
        setIsSearching(false);
        return;
      }

      setSearchStatus("Sending selfie to AI...");
      const result = await matchSelfieViaApi(selfieFile, event.id);

      if (!result.success) {
        if (result.faces_detected === 0) {
          setNoFaceFound(true);
          toast({ title: "No face detected ⚠️", description: "Please upload a clear selfie with exactly one face, looking straight at the camera", variant: "destructive" });
        } else {
          toast({ title: "Error", description: result.error || "Face matching failed", variant: "destructive" });
        }
        setIsSearching(false);
        setSearchStatus("");
        return;
      }

      console.log(`Matches found: ${result.matched.length}`);
      
      // Map matched photo_ids to actual photo objects, preserving distance sort order
      const matchedMap = new Map(allPhotos.map((p) => [p.id, p]));
      const matched = result.matched
        .filter((m) => m.distance < 0.5)
        .map((m) => matchedMap.get(m.photo_id))
        .filter(Boolean) as PhotoRow[];
      
      setMatchedPhotos(matched);
      setViewMode("results");

      if (matched.length > 0) {
        toast({ title: `We found ${matched.length} photos of you 🎉` });
      } else {
        toast({ title: "No photos found 😢", description: "Try a different selfie or check back when more photos are uploaded" });
      }
    } catch (err) {
      console.error("Face matching error:", err);
      toast({ title: "Error", description: "Face recognition failed. Please try again.", variant: "destructive" });
    }

    setIsSearching(false);
    setSearchStatus("");
  };

  const handleNotifyMe = async () => {
    if (!event || !user || !lastDescriptor) return;

    const { error } = await supabase.from("photo_requests").insert({
      user_id: user.id,
      event_id: event.id,
      face_descriptor: Array.from(lastDescriptor),
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setHasNotifyRequest(true);
      toast({ title: "You'll be notified! 🔔", description: "We'll let you know when new photos of you are available" });
    }
  };

  const handleShareWhatsApp = (photoUrl: string) => {
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(`Check out this photo from ${event?.name}! ${photoUrl}`)}`, "_blank");
  };

  const handleDownloadAll = async () => {
    const photos = viewMode === "admin-gallery" ? allPhotos : matchedPhotos;
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
  const displayPhotos = viewMode === "admin-gallery" ? allPhotos : matchedPhotos;

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
          <h2 className="font-display font-bold text-2xl mb-2">Event Not Available</h2>
          <p className="text-muted-foreground mb-6">This event may not exist or hasn't been approved yet</p>
          <Link to="/join"><Button variant="hero">Try Again</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-dark">
      <Navbar />
      <div className="container pt-20 pb-16">
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
              <span className="flex items-center gap-1"><ImageIcon className="w-3.5 h-3.5" />{allPhotos.length} photos</span>
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="glass" size="sm" onClick={() => setShowQR(!showQR)}>
              <Share2 className="w-4 h-4" />
              Share
            </Button>
          </div>
        </div>

        <AnimatePresence>
          {showQR && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mb-8 overflow-hidden">
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

        {/* Prompt: upload selfie first (non-admin only) */}
        {viewMode === "prompt" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-md mx-auto py-12">
            <div className="bg-gradient-card border border-border rounded-2xl p-8 shadow-card text-center">
              <Camera className="w-14 h-14 text-primary mx-auto mb-4" />
              <h2 className="font-display font-semibold text-xl text-foreground mb-2">Upload your selfie to find your photos</h2>
              <p className="text-muted-foreground text-sm mb-6">Our AI will scan all event photos and show only the ones where you appear</p>

              <label className="cursor-pointer">
                <Button variant="hero" size="lg" className="w-full" asChild>
                  <span>
                    <Upload className="w-5 h-5" />
                    Upload Selfie
                  </span>
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="user"
                  className="hidden"
                  onChange={handleSelfieUpload}
                />
              </label>
            </div>
          </motion.div>
        )}

        {/* Selfie preview + find */}
        {viewMode === "selfie" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-md mx-auto mb-12">
            <div className="bg-gradient-card border border-border rounded-2xl p-8 shadow-card text-center">
              <h2 className="font-display font-semibold text-xl text-foreground mb-2">Your Selfie</h2>
              <p className="text-muted-foreground text-sm mb-6">Our AI will find all photos where you appear</p>

              {selfiePreview && (
                <div className="relative mb-6 inline-block">
                  <img src={selfiePreview} alt="Your selfie" className="w-48 h-48 mx-auto rounded-2xl object-cover border-2 border-primary/30" />
                  <button
                    onClick={() => { setSelfiePreview(null); setSelfieFile(null); setNoFaceFound(false); setViewMode("prompt"); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                    className="absolute -top-2 -right-2 bg-destructive rounded-full w-6 h-6 flex items-center justify-center text-destructive-foreground text-sm"
                  >
                    ×
                  </button>
                </div>
              )}

              {noFaceFound && (
                <div className="flex items-center gap-2 text-destructive text-sm mb-4 justify-center">
                  <AlertCircle className="w-4 h-4" />
                  No face detected ⚠️ Please try a clearer photo with one face.
                </div>
              )}

              {isSearching && searchStatus && (
                <div className="flex items-center gap-2 text-primary text-sm mb-4 justify-center">
                  <Brain className="w-4 h-4 animate-pulse" />
                  {searchStatus}
                </div>
              )}

              <Button variant="hero" size="lg" className="w-full" disabled={!selfiePreview || isSearching} onClick={handleFindPhotos}>
                {isSearching ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Scanning photos with AI...
                  </>
                ) : (
                  <>
                    <Search className="w-5 h-5" />
                    Find My Photos
                  </>
                )}
              </Button>

              <Button variant="ghost" size="sm" className="w-full mt-3" onClick={() => { setViewMode("prompt"); setSelfiePreview(null); setSelfieFile(null); }}>
                Cancel
              </Button>
            </div>
          </motion.div>
        )}

        {/* Results (user matched) or Admin gallery */}
        {(viewMode === "results" || viewMode === "admin-gallery") && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-8">
              <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                  {viewMode === "admin-gallery" ? (
                    <span className="text-sm text-foreground font-display">
                      Showing <strong className="text-primary">all {allPhotos.length} photos</strong> (Admin view)
                    </span>
                  ) : (
                    <>
                      <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-primary flex-shrink-0">
                        {selfiePreview && <img src={selfiePreview} alt="You" className="w-full h-full object-cover" />}
                      </div>
                      <span className="text-sm text-foreground font-display">
                        {matchedPhotos.length > 0 ? (
                          <>We found <strong className="text-primary">{matchedPhotos.length} photos</strong> of you 🎉</>
                        ) : (
                          <>No photos found 😢</>
                        )}
                      </span>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {viewMode !== "admin-gallery" && (
                    <Button variant="glass" size="sm" onClick={() => { setViewMode("prompt"); setSelfiePreview(null); setSelfieFile(null); setMatchedPhotos([]); setLastDescriptor(null); }}>
                      New Search
                    </Button>
                  )}
                  {displayPhotos.length > 0 && (
                    <Button variant="hero" size="sm" onClick={handleDownloadAll} disabled={downloading}>
                      <Download className="w-4 h-4" />
                      {downloading ? "Zipping..." : "Download All"}
                    </Button>
                  )}
                </div>
              </div>

              {/* Notify Me button when no matches (non-admin) */}
              {viewMode === "results" && matchedPhotos.length === 0 && user && lastDescriptor && !hasNotifyRequest && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-card border border-border rounded-xl p-6 text-center mb-6">
                  <Bell className="w-8 h-8 text-primary mx-auto mb-3" />
                  <h3 className="font-display font-semibold text-foreground mb-2">Notify me when photos are available</h3>
                  <p className="text-muted-foreground text-sm mb-4">We'll scan new uploads and notify you when we find your photos</p>
                  <Button variant="hero" size="default" onClick={handleNotifyMe}>
                    <Bell className="w-4 h-4" />
                    Notify Me
                  </Button>
                </motion.div>
              )}

              {hasNotifyRequest && viewMode === "results" && matchedPhotos.length === 0 && (
                <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 text-center mb-6">
                  <p className="text-sm text-muted-foreground">
                    🔔 You'll be notified when new photos of you are uploaded
                  </p>
                </div>
              )}
            </motion.div>

            {displayPhotos.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                {displayPhotos.map((photo, i) => (
                  <motion.div
                    key={photo.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.03 }}
                    className="relative group aspect-[4/3] rounded-xl overflow-hidden bg-secondary"
                  >
                    <img src={photo.image_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                    <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    <div className="absolute bottom-2 left-2 right-2 flex justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <div className="flex gap-1">
                        <button className="p-2 bg-background/60 backdrop-blur-sm rounded-lg text-foreground hover:text-primary transition-colors">
                          <Heart className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleShareWhatsApp(photo.image_url)} className="p-2 bg-background/60 backdrop-blur-sm rounded-lg text-foreground hover:text-green-400 transition-colors">
                          <Share2 className="w-4 h-4" />
                        </button>
                      </div>
                      <button onClick={() => handleDownloadSingle(photo.image_url, i)} className="p-2 bg-background/60 backdrop-blur-sm rounded-lg text-foreground hover:text-primary transition-colors">
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
