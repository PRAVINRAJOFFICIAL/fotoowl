import { useState, useRef, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Upload, Camera, Search, Download, Heart, Share2, Image as ImageIcon, ArrowLeft, Loader2, Brain, AlertCircle, Bell, RotateCcw, Sparkles, Trash2, Pencil, Check, X, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
  detectFacesBatch,
  matchFaces,
  type SelfieResult,
} from "@/lib/faceRecognition";
import { useAuth } from "@/contexts/AuthContext";
import PhotoLightbox from "@/components/PhotoLightbox";

type ViewMode = "prompt" | "searching" | "results" | "owner-gallery";

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
  created_by: string | null;
  selected_plan: string;
  payment_status: string;
  expiry_date: string | null;
}

const PHOTOS_PER_CHUNK = 12;

const PLANS: Record<string, number> = {
  basic: 100,
  standard: 10000,
  premium: Infinity,
};

const EventPage = () => {
  const { eventId } = useParams();
  const { user, isAdmin } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>("prompt");
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
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
  const [lastDescriptor, setLastDescriptor] = useState<Float32Array | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [visibleCount, setVisibleCount] = useState(PHOTOS_PER_CHUNK);

  // Owner features
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const [confirmDeletePhotoId, setConfirmDeletePhotoId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const isOwner = !!(user && event && event.created_by === user.id);
  const isApproved = event?.status === "approved";
  const isExpired = !!(event?.expiry_date && new Date(event.expiry_date) < new Date());
  const daysLeft = event?.expiry_date ? Math.ceil((new Date(event.expiry_date).getTime() - Date.now()) / 86400000) : null;
  const canManage = isOwner && isApproved && !isExpired;

  useEffect(() => {
    if (!isOwner) {
      loadFaceModels().catch(console.error);
    }
  }, [isOwner]);

  useEffect(() => {
    if (eventId) fetchEvent();
  }, [eventId]);

  useEffect(() => {
    const saved = localStorage.getItem(`favorites_${eventId}`);
    if (saved) setFavorites(new Set(JSON.parse(saved)));
  }, [eventId]);

  const saveFavorites = (newFavs: Set<string>) => {
    setFavorites(newFavs);
    localStorage.setItem(`favorites_${eventId}`, JSON.stringify([...newFavs]));
  };

  const toggleFavorite = (photoId: string) => {
    const newFavs = new Set(favorites);
    if (newFavs.has(photoId)) newFavs.delete(photoId);
    else newFavs.add(photoId);
    saveFavorites(newFavs);
  };

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

    // Owner and admin can always see their event; guests only see approved
    const currentIsOwner = user && eventData.created_by === user.id;
    if (eventData.status !== "approved" && !isAdmin && !currentIsOwner) {
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

    // Owner or admin → show gallery directly
    if (currentIsOwner || isAdmin) {
      setMatchedPhotos(photos.map(p => ({ photo: p, confidence: 100 })));
      setViewMode("owner-gallery");
      setLoading(false);
      return;
    }

    // Guest: check for notify request
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

  // ── Owner: Upload photos ──
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !event || !canManage) return;

    if (isExpired) {
      toast({ title: "Event expired 🔒", description: "Renew your event to upload photos.", variant: "destructive" });
      return;
    }

    const planLimit = PLANS[event.selected_plan] || 100;
    if (planLimit !== Infinity && allPhotos.length + files.length > planLimit) {
      toast({ title: "Plan limit reached", description: `Your plan allows max ${planLimit} photos.`, variant: "destructive" });
      return;
    }

    const totalFiles = files.length;
    let uploaded = 0;
    setUploadProgress(`Uploading 0/${totalFiles}...`);

    const uploadedPhotos: { id: string; url: string }[] = [];
    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop();
      const path = `${event.id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("event-photos").upload(path, file);
      if (uploadError) { console.error("Upload error:", uploadError.message); continue; }

      const { data: urlData } = supabase.storage.from("event-photos").getPublicUrl(path);
      const { data: photoRow, error: insertErr } = await supabase
        .from("photos")
        .insert({ event_id: event.id, image_url: urlData.publicUrl })
        .select("id")
        .single();

      if (insertErr || !photoRow) continue;
      uploadedPhotos.push({ id: photoRow.id, url: urlData.publicUrl });
      uploaded++;
      setUploadProgress(`Uploaded ${uploaded}/${totalFiles}`);
    }

    // Detect faces
    let totalFaces = 0;
    setUploadProgress("Detecting faces...");
    const urls = uploadedPhotos.map(p => p.url);
    const batchResults = await detectFacesBatch(urls, 3, (done, total) => {
      setUploadProgress(`Detecting faces: ${done}/${total}`);
    });

    for (const result of batchResults) {
      const photo = uploadedPhotos.find(p => p.url === result.url);
      if (!photo) continue;
      for (const desc of result.descriptors) {
        await supabase.from("faces").insert({ photo_id: photo.id, descriptor: Array.from(desc) });
        totalFaces++;
      }
    }

    setUploadProgress(null);
    toast({ title: "Upload Complete!", description: `${uploaded} photos, ${totalFaces} faces detected` });
    if (uploadInputRef.current) uploadInputRef.current.value = "";
    fetchEvent();
  };

  // ── Owner: Delete a photo ──
  const handleDeletePhoto = async (photoId: string) => {
    if (!canManage) return;
    setConfirmDeletePhotoId(null);

    const photo = allPhotos.find(p => p.id === photoId);
    if (!photo) return;

    // Delete faces
    await supabase.from("faces").delete().eq("photo_id", photoId);

    // Delete from storage
    const match = photo.image_url.match(/event-photos\/(.+?)(\?|$)/);
    if (match) {
      await supabase.storage.from("event-photos").remove([match[1]]);
    }

    // Delete photo record
    await supabase.from("photos").delete().eq("id", photoId);

    toast({ title: "Photo deleted" });
    setAllPhotos(prev => prev.filter(p => p.id !== photoId));
    setMatchedPhotos(prev => prev.filter(p => p.photo.id !== photoId));
  };

  // ── Owner: Edit event name ──
  const handleSaveName = async () => {
    if (!event || !isOwner || !newName.trim()) return;
    const { error } = await supabase.from("events").update({ name: newName.trim() }).eq("id", event.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setEvent({ ...event, name: newName.trim() });
      toast({ title: "Event name updated ✅" });
    }
    setEditingName(false);
  };

  // ── Guest: Selfie upload & search ──
  const handleSelfieUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelfieError(null);
    setSearchStatus("Checking face quality...");

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      const result = await detectSelfie(dataUrl);

      if (!result) {
        setSelfieError("No clear face detected ⚠️ Use a well-lit, frontal photo with one face visible.");
        setSearchStatus("");
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      setSearchStatus("");
      setSelfiePreview(dataUrl);
      startSearch(dataUrl, result);
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const startSearch = async (dataUrl: string, selfieResult: SelfieResult) => {
    if (!event) return;

    setViewMode("searching");
    setIsSearching(true);
    setSelfieError(null);

    try {
      const descriptor = selfieResult.descriptor;
      setLastDescriptor(descriptor);

      setSearchStatus("Loading face data...");
      const photoIds = allPhotos.map((p) => p.id);
      if (photoIds.length === 0) {
        setMatchedPhotos([]);
        setIsSearching(false);
        setViewMode("results");
        return;
      }

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

      setSearchStatus("Finding your photos...");

      const matches = matchFaces([descriptor], allFaces, 0.5);

      const matchedMap = new Map(allPhotos.map((p) => [p.id, p]));
      const matched = matches
        .map((m) => {
          const photo = matchedMap.get(m.photoId);
          return photo ? { photo, confidence: m.confidence } : null;
        })
        .filter(Boolean) as { photo: PhotoRow; confidence: number }[];

      setMatchedPhotos(matched);
      setViewMode("results");
      setVisibleCount(PHOTOS_PER_CHUNK);

      if (matched.length > 0) {
        toast({ title: `Found ${matched.length} photos of you! 🎉` });
      } else {
        toast({ title: "No photos found 😢", description: "Try a different selfie or check back later" });
      }
    } catch (err) {
      console.error("Face matching error:", err);
      toast({ title: "Error", description: "Face recognition failed. Please try again.", variant: "destructive" });
      setViewMode("prompt");
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
      toast({ title: "You'll be notified! 🔔", description: "We'll alert you when new photos match" });
    }
  };

  const handleShareWhatsApp = (photoUrl: string) => {
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(`Check out this photo from ${event?.name}! ${photoUrl}`)}`, "_blank");
  };

  const handleDownloadAll = async () => {
    const photos = viewMode === "owner-gallery" ? allPhotos : matchedPhotos.map(m => m.photo);
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
    setSelfiePreview(null);
    setMatchedPhotos([]);
    setLastDescriptor(null);
    setSelfieError(null);
    setVisibleCount(PHOTOS_PER_CHUNK);
  };

  const loadMore = () => {
    setVisibleCount(prev => prev + PHOTOS_PER_CHUNK);
  };

  const eventUrl = event ? `${window.location.origin}/event/${event.event_code}` : "";
  const displayPhotos = viewMode === "owner-gallery" ? allPhotos.map(p => ({ photo: p, confidence: 100 })) : matchedPhotos;
  const visiblePhotos = displayPhotos.slice(0, visibleCount);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-dark">
        <Navbar />
        <div className="container pt-24 pb-16">
          <Skeleton className="h-8 w-64 mb-4" />
          <Skeleton className="h-4 w-48 mb-8" />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
              <Skeleton key={i} className="aspect-[4/3] rounded-xl" />
            ))}
          </div>
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

      {/* Delete photo confirmation */}
      <AnimatePresence>
        {confirmDeletePhotoId && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full shadow-card">
              <Trash2 className="w-10 h-10 text-destructive mx-auto mb-4" />
              <h3 className="font-display font-semibold text-lg text-center mb-2">Delete Photo?</h3>
              <p className="text-muted-foreground text-sm text-center mb-6">This will permanently remove the photo and its face data.</p>
              <div className="flex gap-3">
                <Button variant="ghost" className="flex-1" onClick={() => setConfirmDeletePhotoId(null)}>Cancel</Button>
                <Button variant="destructive" className="flex-1" onClick={() => handleDeletePhoto(confirmDeletePhotoId)}>
                  <Trash2 className="w-4 h-4" /> Delete
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={displayPhotos.map(d => d.photo)}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onDownload={handleDownloadSingle}
          onShare={handleShareWhatsApp}
          onFavorite={toggleFavorite}
          favorites={favorites}
          eventName={event.name}
        />
      )}

      <input ref={uploadInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />

      <div className="container pt-20 pb-16">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8 pt-4">
          <div>
            <Link to={isOwner ? "/my-events" : "/"} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground text-sm mb-3 font-display">
              <ArrowLeft className="w-4 h-4" /> Back
            </Link>

            {editingName && isOwner ? (
              <div className="flex items-center gap-2">
                <Input value={newName} onChange={e => setNewName(e.target.value)} className="bg-secondary border-border text-foreground h-10 font-display font-bold text-xl max-w-xs" autoFocus />
                <button onClick={handleSaveName} className="p-2 rounded-lg bg-primary text-primary-foreground"><Check className="w-4 h-4" /></button>
                <button onClick={() => setEditingName(false)} className="p-2 rounded-lg bg-secondary text-muted-foreground"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="font-display font-bold text-2xl md:text-4xl text-foreground">{event.name}</h1>
                {isOwner && (
                  <button onClick={() => { setEditingName(true); setNewName(event.name); }} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" title="Edit event name">
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

            <div className="flex items-center gap-4 text-muted-foreground text-sm mt-2">
              {event.date && (
                <span>{new Date(event.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
              )}
              <span className="flex items-center gap-1"><ImageIcon className="w-3.5 h-3.5" />{allPhotos.length} photos</span>
              {isOwner && !isApproved && (
                <span className="inline-flex items-center gap-1 text-xs bg-destructive/20 text-destructive px-2 py-0.5 rounded-full">
                  <Lock className="w-3 h-3" /> Pending Approval
                </span>
              )}
              {isOwner && isApproved && !isExpired && daysLeft !== null && (
                <span className="inline-flex items-center gap-1 text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                  🟢 {daysLeft}d left
                </span>
              )}
              {isOwner && isExpired && (
                <span className="inline-flex items-center gap-1 text-xs bg-destructive/20 text-destructive px-2 py-0.5 rounded-full">
                  🔴 Expired
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {canManage && (
              <Button variant="hero" size="sm" onClick={() => uploadInputRef.current?.click()}>
                <Upload className="w-4 h-4" /> Upload Photos
              </Button>
            )}
            {isOwner && !isApproved && (
              <Button variant="glass" size="sm" disabled className="opacity-60">
                <Lock className="w-4 h-4" /> Upload Locked
              </Button>
            )}
            {isOwner && isExpired && (
              <Button variant="hero" size="sm" onClick={() => {
                toast({ title: "Renewal Required 💰", description: "Contact admin or pay ₹49 to renew for 30 more days." });
              }}>
                <RotateCcw className="w-4 h-4" /> Renew Event
              </Button>
            )}
            <Button variant="glass" size="sm" onClick={() => setShowQR(!showQR)}>
              <Share2 className="w-4 h-4" /> Share
            </Button>
          </div>
        </div>

        {/* Upload progress */}
        {uploadProgress && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 bg-primary/10 border border-primary/20 rounded-xl p-4 flex items-center gap-3">
            <Brain className="w-5 h-5 text-primary animate-pulse" />
            <span className="text-sm text-foreground font-display">{uploadProgress}</span>
          </motion.div>
        )}

        <AnimatePresence>
          {showQR && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mb-8 overflow-hidden">
              <div className="bg-gradient-card border border-border rounded-2xl p-8 flex flex-col md:flex-row items-center gap-8">
                <div className="bg-foreground p-4 rounded-xl">
                  <QRCodeSVG value={eventUrl} size={160} />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-lg text-foreground mb-2">Share this Event</h3>
                  <p className="text-muted-foreground text-sm mb-3">Guests can scan this QR code or use the event code</p>
                  <div className="bg-secondary text-foreground font-display font-bold tracking-widest text-xl px-6 py-3 rounded-xl inline-block">
                    {event.event_code}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* GUEST: Upload selfie prompt */}
        {viewMode === "prompt" && !isOwner && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-lg mx-auto py-12">
            <div className="bg-gradient-card border border-border rounded-2xl p-8 shadow-card text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Camera className="w-8 h-8 text-primary" />
              </div>
              <h2 className="font-display font-semibold text-xl text-foreground mb-2">Find Your Photos</h2>
              <p className="text-muted-foreground text-sm mb-1">Upload your selfie to find your photos</p>
              <p className="text-muted-foreground text-xs mb-6">📸 Well-lit, frontal — look straight at camera</p>

              {selfieError && (
                <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 text-destructive text-sm mb-4 justify-center bg-destructive/10 p-3 rounded-lg">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {selfieError}
                </motion.div>
              )}

              {searchStatus && (
                <div className="flex items-center gap-2 text-primary text-sm mb-4 justify-center">
                  <Brain className="w-4 h-4 animate-pulse" />
                  {searchStatus}
                </div>
              )}

              {selfiePreview && (
                <div className="flex justify-center mb-6">
                  <img src={selfiePreview} alt="Your selfie" className="w-24 h-24 rounded-2xl object-cover border-2 border-primary/30" />
                </div>
              )}

              <label className="cursor-pointer">
                <Button variant="hero" size="lg" className="w-full" asChild>
                  <span>
                    <Upload className="w-5 h-5" />
                    Upload Your Selfie
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

        {/* SEARCHING */}
        {viewMode === "searching" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-lg mx-auto py-12">
            <div className="bg-gradient-card border border-border rounded-2xl p-8 shadow-card text-center">
              <Sparkles className="w-10 h-10 text-primary mx-auto mb-4 animate-pulse" />
              <h2 className="font-display font-semibold text-xl text-foreground mb-2">Finding Your Photos...</h2>

              {selfiePreview && (
                <div className="flex justify-center mb-6">
                  <img src={selfiePreview} alt="Your selfie" className="w-20 h-20 rounded-2xl object-cover border-2 border-primary/30" />
                </div>
              )}

              <div className="mb-4">
                <div className="flex items-center gap-2 text-primary text-sm justify-center mb-3">
                  <Brain className="w-4 h-4 animate-pulse" />
                  {searchStatus || "Scanning photos..."}
                </div>
                <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden">
                  <motion.div
                    className="h-full bg-primary rounded-full"
                    initial={{ width: "0%" }}
                    animate={{ width: "85%" }}
                    transition={{ duration: 4, ease: "easeInOut" }}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* RESULTS (guest) or OWNER GALLERY */}
        {(viewMode === "results" || viewMode === "owner-gallery") && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-8">
              <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                  {viewMode === "owner-gallery" ? (
                    <span className="text-sm text-foreground font-display">
                      {isOwner ? (
                        <>Your event · <strong className="text-primary">{allPhotos.length} photos</strong></>
                      ) : (
                        <>Showing <strong className="text-primary">all {allPhotos.length} photos</strong> (Admin view)</>
                      )}
                    </span>
                  ) : (
                    <>
                      {selfiePreview && (
                        <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-primary flex-shrink-0">
                          <img src={selfiePreview} alt="" className="w-full h-full object-cover" />
                        </div>
                      )}
                      <span className="text-sm text-foreground font-display">
                        {matchedPhotos.length > 0 ? (
                          <>Found <strong className="text-primary">{matchedPhotos.length} photos</strong> of you 🎉</>
                        ) : (
                          <>No photos found 😢</>
                        )}
                      </span>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {viewMode === "results" && (
                    <Button variant="glass" size="sm" onClick={resetSearch}>
                      <RotateCcw className="w-4 h-4" /> Upload Another Selfie
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
              {viewMode === "results" && matchedPhotos.length === 0 && user && lastDescriptor && !hasNotifyRequest && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-card border border-border rounded-xl p-6 text-center mb-6">
                  <Bell className="w-8 h-8 text-primary mx-auto mb-3" />
                  <h3 className="font-display font-semibold text-foreground mb-2">Get notified when photos are available</h3>
                  <p className="text-muted-foreground text-sm mb-4">We'll scan new uploads and alert you</p>
                  <Button variant="hero" size="default" onClick={handleNotifyMe}>
                    <Bell className="w-4 h-4" /> Notify Me
                  </Button>
                </motion.div>
              )}

              {hasNotifyRequest && viewMode === "results" && matchedPhotos.length === 0 && (
                <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 text-center mb-6">
                  <p className="text-sm text-muted-foreground">🔔 You'll be notified when new photos match</p>
                </div>
              )}
            </motion.div>

            {visiblePhotos.length > 0 && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                  {visiblePhotos.map(({ photo, confidence }, i) => (
                    <motion.div
                      key={photo.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: Math.min(i * 0.03, 0.3) }}
                      className="relative group aspect-[4/3] rounded-xl overflow-hidden bg-secondary cursor-pointer"
                      onClick={() => setLightboxIndex(i)}
                    >
                      <img src={photo.image_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />

                      {viewMode === "results" && (
                        <div className="absolute top-2 right-2 bg-background/70 backdrop-blur-sm rounded-lg px-2 py-0.5 text-xs font-display font-semibold text-primary">
                          {confidence}%
                        </div>
                      )}

                      {favorites.has(photo.id) && (
                        <div className="absolute top-2 left-2">
                          <Heart className="w-4 h-4 fill-primary text-primary" />
                        </div>
                      )}

                      {new Date(photo.created_at).getTime() > Date.now() - 86400000 && (
                        <div className={`absolute top-2 ${favorites.has(photo.id) ? 'left-8' : 'left-2'} bg-primary/90 text-primary-foreground text-xs px-1.5 py-0.5 rounded font-display font-semibold`}>
                          NEW
                        </div>
                      )}

                      <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      <div className="absolute bottom-2 left-2 right-2 flex justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <div className="flex gap-1">
                          <button onClick={(e) => { e.stopPropagation(); toggleFavorite(photo.id); }} className="p-2 bg-background/60 backdrop-blur-sm rounded-lg text-foreground hover:text-primary transition-colors">
                            <Heart className={`w-4 h-4 ${favorites.has(photo.id) ? "fill-primary text-primary" : ""}`} />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleShareWhatsApp(photo.image_url); }} className="p-2 bg-background/60 backdrop-blur-sm rounded-lg text-foreground hover:text-primary transition-colors">
                            <Share2 className="w-4 h-4" />
                          </button>
                          {canManage && (
                            <button onClick={(e) => { e.stopPropagation(); setConfirmDeletePhotoId(photo.id); }} className="p-2 bg-background/60 backdrop-blur-sm rounded-lg text-foreground hover:text-destructive transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); handleDownloadSingle(photo.image_url, i); }} className="p-2 bg-background/60 backdrop-blur-sm rounded-lg text-foreground hover:text-primary transition-colors">
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {visibleCount < displayPhotos.length && (
                  <div className="text-center mt-8">
                    <Button variant="glass" size="lg" onClick={loadMore}>
                      Show More ({displayPhotos.length - visibleCount} remaining)
                    </Button>
                  </div>
                )}
              </>
            )}

            {viewMode === "owner-gallery" && allPhotos.length === 0 && isOwner && (
              <div className="text-center py-12">
                <ImageIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-display font-semibold text-lg mb-2">No photos yet</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  {isExpired ? "Your event has expired. Renew to upload photos." : isApproved ? "Upload photos for your guests to find" : "Your event needs admin approval before you can upload photos"}
                </p>
                {isApproved && (
                  <Button variant="hero" onClick={() => uploadInputRef.current?.click()}>
                    <Upload className="w-4 h-4" /> Upload Photos
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default EventPage;
