import { useState, useRef, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Upload, Camera, Search, Download, Heart, Share2, Image as ImageIcon, ArrowLeft, Loader2, Brain, AlertCircle, Bell, Plus, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { motion, AnimatePresence } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import {
  loadFaceModels,
  detectSelfie,
  detectMultiSelfie,
  matchFaces,
  distanceToConfidence,
  type SelfieResult,
  type MatchCandidate,
} from "@/lib/faceRecognition";
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

const MAX_SELFIES = 3;
const MIN_SELFIES = 2;

const EventPage = () => {
  const { eventId } = useParams();
  const { user, isAdmin } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>("prompt");
  const [selfiePreviews, setSelfiePreviews] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchStatus, setSearchStatus] = useState("");
  const [showQR, setShowQR] = useState(false);
  const [event, setEvent] = useState<EventRow | null>(null);
  const [allPhotos, setAllPhotos] = useState<PhotoRow[]>([]);
  const [matchedPhotos, setMatchedPhotos] = useState<{ photo: PhotoRow; confidence: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [selfieError, setSelfieError] = useState<string | null>(null);
  const [hasNotifyRequest, setHasNotifyRequest] = useState(false);
  const [lastDescriptors, setLastDescriptors] = useState<Float32Array[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isAdmin) {
      loadFaceModels().catch(console.error);
    }
  }, [isAdmin]);

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

    if (isAdmin) {
      setMatchedPhotos(photos.map(p => ({ photo: p, confidence: 100 })));
      setViewMode("admin-gallery");
      setLoading(false);
      return;
    }

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

  const handleSelfieUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || selfiePreviews.length >= MAX_SELFIES) return;

    setSelfieError(null);

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;

      // Validate face immediately
      setSearchStatus("Checking face quality...");
      const result = await detectSelfie(dataUrl);

      if (!result) {
        setSelfieError("No clear face detected. Please use a well-lit, frontal selfie with one face visible.");
        setSearchStatus("");
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      setSearchStatus("");
      setSelfiePreviews(prev => [...prev, dataUrl]);
      if (selfiePreviews.length === 0) setViewMode("selfie");
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeSelfie = (index: number) => {
    setSelfiePreviews(prev => prev.filter((_, i) => i !== index));
    setSelfieError(null);
    if (selfiePreviews.length <= 1) setViewMode("prompt");
  };

  const handleFindPhotos = async () => {
    if (selfiePreviews.length < MIN_SELFIES || !event) return;

    setIsSearching(true);
    setSelfieError(null);

    try {
      setSearchStatus("Analyzing your selfies...");
      const multiResult = await detectMultiSelfie(selfiePreviews);

      if (!multiResult) {
        setSelfieError("Could not detect a clear face in all selfies. Please retake.");
        setIsSearching(false);
        setSearchStatus("");
        return;
      }

      const selfieDescriptors = [multiResult.averaged, ...multiResult.individual.map(r => r.descriptor)];
      setLastDescriptors(selfieDescriptors);

      setSearchStatus("Loading event face data...");
      const photoIds = allPhotos.map((p) => p.id);
      if (photoIds.length === 0) {
        setMatchedPhotos([]);
        setIsSearching(false);
        setViewMode("results");
        return;
      }

      // Fetch all face descriptors
      let allFaces: { photo_id: string; descriptor: number[] }[] = [];
      for (let i = 0; i < photoIds.length; i += 500) {
        const batch = photoIds.slice(i, i + 500);
        const { data: facesData } = await supabase
          .from("faces")
          .select("photo_id, descriptor")
          .in("photo_id", batch);
        if (facesData) {
          allFaces.push(...facesData.map((f: any) => ({
            photo_id: f.photo_id as string,
            descriptor: f.descriptor as number[],
          })));
        }
      }

      console.log(`Faces stored: ${allFaces.length}`);
      setSearchStatus("AI is finding your photos...");

      // Use all selfie descriptors for double validation matching
      const matches = matchFaces(selfieDescriptors, allFaces, 0.48, 50);
      console.log(`Matches found: ${matches.length}`);

      const matchedMap = new Map(allPhotos.map((p) => [p.id, p]));
      const matched = matches
        .map((m) => {
          const photo = matchedMap.get(m.photoId);
          return photo ? { photo, confidence: m.confidence } : null;
        })
        .filter(Boolean) as { photo: PhotoRow; confidence: number }[];

      setMatchedPhotos(matched);
      setViewMode("results");

      if (matched.length > 0) {
        toast({ title: `We found ${matched.length} photos of you 🎉` });
      } else {
        toast({ title: "No photos found 😢", description: "Try different selfies or check back later" });
      }
    } catch (err) {
      console.error("Face matching error:", err);
      toast({ title: "Error", description: "Face recognition failed. Please try again.", variant: "destructive" });
    }

    setIsSearching(false);
    setSearchStatus("");
  };

  const handleNotifyMe = async () => {
    if (!event || !user || !lastDescriptors) return;

    const { error } = await supabase.from("photo_requests").insert({
      user_id: user.id,
      event_id: event.id,
      face_descriptor: Array.from(lastDescriptors[0]),
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
    const photos = viewMode === "admin-gallery" ? allPhotos : matchedPhotos.map(m => m.photo);
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

  const resetSearch = () => {
    setViewMode("prompt");
    setSelfiePreviews([]);
    setMatchedPhotos([]);
    setLastDescriptors(null);
    setSelfieError(null);
  };

  const eventUrl = event ? `${window.location.origin}/event/${event.event_code}` : "";
  const displayPhotos = viewMode === "admin-gallery" ? allPhotos.map(p => ({ photo: p, confidence: 100 })) : matchedPhotos;

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

        {/* PROMPT: Upload selfies */}
        {viewMode === "prompt" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-lg mx-auto py-12">
            <div className="bg-gradient-card border border-border rounded-2xl p-8 shadow-card text-center">
              <Camera className="w-14 h-14 text-primary mx-auto mb-4" />
              <h2 className="font-display font-semibold text-xl text-foreground mb-2">Upload {MIN_SELFIES}–{MAX_SELFIES} selfies to find your photos</h2>
              <p className="text-muted-foreground text-sm mb-2">Multiple selfies improve accuracy through AI double-validation</p>
              <p className="text-muted-foreground text-xs mb-6">📸 Use clear, well-lit, frontal photos — look straight at the camera</p>

              {selfieError && (
                <div className="flex items-center gap-2 text-destructive text-sm mb-4 justify-center">
                  <AlertCircle className="w-4 h-4" />
                  {selfieError}
                </div>
              )}

              {searchStatus && (
                <div className="flex items-center gap-2 text-primary text-sm mb-4 justify-center">
                  <Brain className="w-4 h-4 animate-pulse" />
                  {searchStatus}
                </div>
              )}

              {/* Selfie thumbnails */}
              {selfiePreviews.length > 0 && (
                <div className="flex gap-3 justify-center mb-6">
                  {selfiePreviews.map((preview, i) => (
                    <div key={i} className="relative">
                      <img src={preview} alt={`Selfie ${i + 1}`} className="w-20 h-20 rounded-xl object-cover border-2 border-primary/30" />
                      <button
                        onClick={() => removeSelfie(i)}
                        className="absolute -top-2 -right-2 bg-destructive rounded-full w-5 h-5 flex items-center justify-center text-destructive-foreground text-xs"
                      >
                        ×
                      </button>
                      <CheckCircle2 className="absolute -bottom-1 -right-1 w-4 h-4 text-primary" />
                    </div>
                  ))}
                </div>
              )}

              <label className="cursor-pointer">
                <Button variant={selfiePreviews.length === 0 ? "hero" : "glass"} size="lg" className="w-full" asChild>
                  <span>
                    {selfiePreviews.length === 0 ? <Upload className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                    {selfiePreviews.length === 0
                      ? "Upload First Selfie"
                      : selfiePreviews.length < MAX_SELFIES
                        ? `Add Selfie (${selfiePreviews.length}/${MAX_SELFIES})`
                        : `${MAX_SELFIES} selfies added ✓`}
                  </span>
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="user"
                  className="hidden"
                  onChange={handleSelfieUpload}
                  disabled={selfiePreviews.length >= MAX_SELFIES}
                />
              </label>

              {selfiePreviews.length >= MIN_SELFIES && (
                <Button variant="hero" size="lg" className="w-full mt-3" onClick={() => setViewMode("selfie")}>
                  <Search className="w-5 h-5" />
                  Continue to Find Photos
                </Button>
              )}
            </div>
          </motion.div>
        )}

        {/* SELFIE: Review + find */}
        {viewMode === "selfie" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-lg mx-auto mb-12">
            <div className="bg-gradient-card border border-border rounded-2xl p-8 shadow-card text-center">
              <h2 className="font-display font-semibold text-xl text-foreground mb-2">Your Selfies ({selfiePreviews.length})</h2>
              <p className="text-muted-foreground text-sm mb-6">AI will cross-validate all selfies for maximum accuracy</p>

              {/* Face guide overlay info */}
              <div className="flex gap-3 justify-center mb-6">
                {selfiePreviews.map((preview, i) => (
                  <div key={i} className="relative">
                    <img src={preview} alt={`Selfie ${i + 1}`} className="w-24 h-24 rounded-2xl object-cover border-2 border-primary/30" />
                    <div className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                      {i + 1}
                    </div>
                  </div>
                ))}
              </div>

              {selfieError && (
                <div className="flex items-center gap-2 text-destructive text-sm mb-4 justify-center">
                  <AlertCircle className="w-4 h-4" />
                  {selfieError}
                </div>
              )}

              {isSearching && searchStatus && (
                <div className="flex items-center gap-2 text-primary text-sm mb-4 justify-center">
                  <Brain className="w-4 h-4 animate-pulse" />
                  {searchStatus}
                </div>
              )}

              <Button variant="hero" size="lg" className="w-full" disabled={isSearching} onClick={handleFindPhotos}>
                {isSearching ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Scanning with AI...
                  </>
                ) : (
                  <>
                    <Search className="w-5 h-5" />
                    Find My Photos
                  </>
                )}
              </Button>

              <Button variant="ghost" size="sm" className="w-full mt-3" onClick={resetSearch}>
                Cancel
              </Button>
            </div>
          </motion.div>
        )}

        {/* RESULTS or ADMIN GALLERY */}
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
                      <div className="flex -space-x-2">
                        {selfiePreviews.slice(0, 3).map((p, i) => (
                          <div key={i} className="w-8 h-8 rounded-full overflow-hidden border-2 border-primary flex-shrink-0">
                            <img src={p} alt="" className="w-full h-full object-cover" />
                          </div>
                        ))}
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
                    <Button variant="glass" size="sm" onClick={resetSearch}>
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

              {/* Notify Me */}
              {viewMode === "results" && matchedPhotos.length === 0 && user && lastDescriptors && !hasNotifyRequest && (
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
                {displayPhotos.map(({ photo, confidence }, i) => (
                  <motion.div
                    key={photo.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.03 }}
                    className="relative group aspect-[4/3] rounded-xl overflow-hidden bg-secondary"
                  >
                    <img src={photo.image_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />

                    {/* Confidence badge (non-admin) */}
                    {viewMode !== "admin-gallery" && (
                      <div className="absolute top-2 right-2 bg-background/70 backdrop-blur-sm rounded-lg px-2 py-0.5 text-xs font-display font-semibold text-primary">
                        {confidence}%
                      </div>
                    )}

                    <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    <div className="absolute bottom-2 left-2 right-2 flex justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <div className="flex gap-1">
                        <button className="p-2 bg-background/60 backdrop-blur-sm rounded-lg text-foreground hover:text-primary transition-colors">
                          <Heart className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleShareWhatsApp(photo.image_url)} className="p-2 bg-background/60 backdrop-blur-sm rounded-lg text-foreground hover:text-primary transition-colors">
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
