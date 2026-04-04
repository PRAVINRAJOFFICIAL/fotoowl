import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Upload, Image, Calendar, Trash2, Brain, CheckCircle, XCircle, Clock, CreditCard,
  Users, BarChart3, AlertTriangle, Eye, RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import Navbar from "@/components/Navbar";
import EventCard from "@/components/EventCard";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { detectFacesBatch } from "@/lib/faceRecognition";
import { useAuth } from "@/contexts/AuthContext";
import { QRCodeSVG } from "qrcode.react";

type AdminTab = "events" | "approvals" | "users" | "stats";
type BulkAction = "delete-all-events" | "delete-all-photos" | "reset-app" | null;

interface EventRow {
  id: string;
  name: string;
  date: string | null;
  event_code: string;
  cover_image: string | null;
  created_at: string;
  created_by: string | null;
  selected_plan: string;
  payment_status: string;
  status: string;
}

interface PendingEvent extends EventRow {
  user_email?: string;
}

interface ProfileRow {
  id: string;
  display_name: string | null;
  role: string;
  phone: string | null;
  created_at: string;
}

const PLANS = [
  { id: "basic", name: "Basic", photos: 100, price: "₹499" },
  { id: "standard", name: "Standard", photos: 10000, price: "₹1,999" },
  { id: "premium", name: "Premium", photos: Infinity, price: "₹4,999", label: "Unlimited" },
];

const UPI_NUMBER = "9363237647";

const Admin = () => {
  const [tab, setTab] = useState<AdminTab>("events");
  const [showCreate, setShowCreate] = useState(false);
  const [newEvent, setNewEvent] = useState({ name: "", date: "" });
  const [selectedPlan, setSelectedPlan] = useState("basic");
  const [showPayment, setShowPayment] = useState(false);
  const [creatingEventData, setCreatingEventData] = useState<{ name: string; date: string; plan: string } | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [allEvents, setAllEvents] = useState<EventRow[]>([]);
  const [pendingEvents, setPendingEvents] = useState<PendingEvent[]>([]);
  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [photoCountMap, setPhotoCountMap] = useState<Record<string, number>>({});
  const [uploadingEventId, setUploadingEventId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [bulkAction, setBulkAction] = useState<BulkAction>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [totalPhotos, setTotalPhotos] = useState(0);
  const [totalFacesCount, setTotalFacesCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();

  useEffect(() => {
    if (user) {
      fetchEvents(user.id);
      if (isAdmin) {
        fetchAllPendingEvents();
        fetchAllEvents();
        fetchUsers();
        fetchGlobalStats();
      }
    } else {
      setLoading(false);
    }
  }, [user, isAdmin]);

  const fetchEvents = async (userId: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("created_by", userId)
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setEvents((data as EventRow[]) || []);
      if (data && data.length > 0) {
        const ids = data.map((e: any) => e.id);
        const { data: photos } = await supabase.from("photos").select("event_id").in("event_id", ids);
        const counts: Record<string, number> = {};
        photos?.forEach((p: { event_id: string }) => { counts[p.event_id] = (counts[p.event_id] || 0) + 1; });
        setPhotoCountMap(counts);
      }
    }
    setLoading(false);
  };

  const fetchAllEvents = async () => {
    const { data } = await supabase.from("events").select("*").order("created_at", { ascending: false });
    setAllEvents((data as EventRow[]) || []);
  };

  const fetchAllPendingEvents = async () => {
    const { data } = await supabase.from("events").select("*").in("status", ["pending"]).order("created_at", { ascending: false });
    setPendingEvents((data as PendingEvent[]) || []);
  };

  const fetchUsers = async () => {
    const { data } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
    setUsers((data as ProfileRow[]) || []);
  };

  const fetchGlobalStats = async () => {
    const { count: photosCount } = await supabase.from("photos").select("*", { count: "exact", head: true });
    const { count: facesCount } = await supabase.from("faces").select("*", { count: "exact", head: true });
    setTotalPhotos(photosCount || 0);
    setTotalFacesCount(facesCount || 0);
  };

  const generateEventCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
  };

  const handleProceedToPayment = () => {
    if (!newEvent.name.trim()) {
      toast({ title: "Error", description: "Event name is required", variant: "destructive" });
      return;
    }
    setCreatingEventData({ name: newEvent.name.trim(), date: newEvent.date, plan: selectedPlan });
    setShowPayment(true);
  };

  const handleIPaid = async () => {
    if (!creatingEventData || !user) return;
    setCreating(true);
    const eventCode = generateEventCode();
    const { error } = await supabase.from("events").insert({
      name: creatingEventData.name,
      date: creatingEventData.date || null,
      event_code: eventCode,
      created_by: user.id,
      selected_plan: creatingEventData.plan,
      payment_status: "pending",
      status: "pending",
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Event Created!", description: "Waiting for admin approval." });
      setNewEvent({ name: "", date: "" });
      setShowCreate(false);
      setShowPayment(false);
      setCreatingEventData(null);
      setSelectedPlan("basic");
      fetchEvents(user.id);
    }
    setCreating(false);
  };

  const handleApprove = async (eventId: string) => {
    const { error } = await supabase.from("events").update({ status: "approved", payment_status: "paid" }).eq("id", eventId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Event approved! ✅" });
      fetchAllPendingEvents();
      fetchAllEvents();
    }
  };

  const handleReject = async (eventId: string) => {
    setConfirmDeleteId(eventId);
  };

  // Cascading delete for a single event
  const deleteEventCascade = async (eventId: string) => {
    const { data: photos } = await supabase.from("photos").select("id, image_url").eq("event_id", eventId);

    if (photos && photos.length > 0) {
      const photoIds = photos.map(p => p.id);
      for (let i = 0; i < photoIds.length; i += 100) {
        await supabase.from("faces").delete().in("photo_id", photoIds.slice(i, i + 100));
      }

      const storagePaths = photos
        .map(p => {
          const match = p.image_url.match(/event-photos\/(.+?)(\?|$)/);
          return match ? match[1] : null;
        })
        .filter(Boolean) as string[];

      if (storagePaths.length > 0) {
        for (let i = 0; i < storagePaths.length; i += 100) {
          await supabase.storage.from("event-photos").remove(storagePaths.slice(i, i + 100));
        }
      }

      await supabase.from("photos").delete().eq("event_id", eventId);
    }

    await supabase.from("photo_requests").delete().eq("event_id", eventId);
    await supabase.from("notifications").delete().eq("event_id", eventId);
    await supabase.from("events").delete().eq("id", eventId);
  };

  const confirmRejectAndDelete = async () => {
    if (!confirmDeleteId) return;
    const eventId = confirmDeleteId;
    setConfirmDeleteId(null);

    try {
      await deleteEventCascade(eventId);
      toast({ title: "Event rejected & deleted ❌", description: "All associated data has been removed" });
      fetchAllPendingEvents();
      fetchAllEvents();
      fetchGlobalStats();
    } catch (err) {
      console.error("Reject error:", err);
      toast({ title: "Error", description: "Failed to fully delete event", variant: "destructive" });
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    setConfirmDeleteId(eventId);
  };

  const confirmDelete = async () => {
    if (!confirmDeleteId) return;
    const eventId = confirmDeleteId;
    setConfirmDeleteId(null);

    try {
      await deleteEventCascade(eventId);
      toast({ title: "Event deleted" });
      fetchEvents(user!.id);
      if (isAdmin) {
        fetchAllEvents();
        fetchGlobalStats();
      }
    } catch {
      toast({ title: "Error deleting event", variant: "destructive" });
    }
  };

  // ── Bulk admin actions ──

  const handleBulkDeleteAllEvents = async () => {
    setBulkDeleting(true);
    try {
      const { data: allEvts } = await supabase.from("events").select("id");
      if (allEvts) {
        for (const evt of allEvts) {
          await deleteEventCascade(evt.id);
        }
      }
      toast({ title: "All events deleted ✅", description: "All events, photos, and face data removed" });
      fetchEvents(user!.id);
      fetchAllEvents();
      fetchAllPendingEvents();
      fetchGlobalStats();
    } catch (err) {
      console.error(err);
      toast({ title: "Error", description: "Failed to delete all events", variant: "destructive" });
    }
    setBulkDeleting(false);
    setBulkAction(null);
  };

  const handleBulkDeleteAllPhotos = async () => {
    setBulkDeleting(true);
    try {
      // Delete all faces
      const { data: allFacesData } = await supabase.from("faces").select("id");
      if (allFacesData && allFacesData.length > 0) {
        for (let i = 0; i < allFacesData.length; i += 100) {
          const ids = allFacesData.slice(i, i + 100).map(f => f.id);
          await supabase.from("faces").delete().in("id", ids);
        }
      }

      // Get all photos for storage cleanup
      const { data: allPhotosData } = await supabase.from("photos").select("id, image_url");
      if (allPhotosData && allPhotosData.length > 0) {
        const storagePaths = allPhotosData
          .map(p => {
            const match = p.image_url.match(/event-photos\/(.+?)(\?|$)/);
            return match ? match[1] : null;
          })
          .filter(Boolean) as string[];

        if (storagePaths.length > 0) {
          for (let i = 0; i < storagePaths.length; i += 100) {
            await supabase.storage.from("event-photos").remove(storagePaths.slice(i, i + 100));
          }
        }

        // Delete photo records
        for (let i = 0; i < allPhotosData.length; i += 100) {
          const ids = allPhotosData.slice(i, i + 100).map(p => p.id);
          await supabase.from("photos").delete().in("id", ids);
        }
      }

      toast({ title: "All photos deleted ✅", description: "Storage, photos table, and faces cleared" });
      fetchEvents(user!.id);
      fetchGlobalStats();
    } catch (err) {
      console.error(err);
      toast({ title: "Error", description: "Failed to delete all photos", variant: "destructive" });
    }
    setBulkDeleting(false);
    setBulkAction(null);
  };

  const handleResetApp = async () => {
    setBulkDeleting(true);
    try {
      // Delete everything except profiles
      const { data: allEvts } = await supabase.from("events").select("id");
      if (allEvts) {
        for (const evt of allEvts) {
          await deleteEventCascade(evt.id);
        }
      }
      // Also clean up any orphan photo_requests/notifications
      toast({ title: "App reset complete ✅", description: "All events, photos, and face data cleared. Users preserved." });
      fetchEvents(user!.id);
      fetchAllEvents();
      fetchAllPendingEvents();
      fetchUsers();
      fetchGlobalStats();
    } catch (err) {
      console.error(err);
      toast({ title: "Error", description: "Reset failed", variant: "destructive" });
    }
    setBulkDeleting(false);
    setBulkAction(null);
  };

  const executeBulkAction = () => {
    switch (bulkAction) {
      case "delete-all-events": return handleBulkDeleteAllEvents();
      case "delete-all-photos": return handleBulkDeleteAllPhotos();
      case "reset-app": return handleResetApp();
    }
  };

  const bulkActionLabels: Record<string, { title: string; desc: string }> = {
    "delete-all-events": { title: "Delete All Events", desc: "This will permanently delete ALL events, their photos, face data, and notifications." },
    "delete-all-photos": { title: "Delete All Photos", desc: "This will delete ALL photos from storage and database, and all face descriptors." },
    "reset-app": { title: "Reset App Data", desc: "This will delete ALL events, photos, and face data. User accounts will be preserved." },
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !uploadingEventId) return;

    const ev = events.find(x => x.id === uploadingEventId);
    const plan = PLANS.find(p => p.id === ev?.selected_plan);
    const currentCount = photoCountMap[uploadingEventId] || 0;

    if (plan && plan.photos !== Infinity && currentCount + files.length > plan.photos) {
      toast({ title: "Plan limit reached", description: `Your ${plan.name} plan allows max ${plan.photos} photos.`, variant: "destructive" });
      return;
    }

    const totalFiles = files.length;
    let uploaded = 0;

    setUploadProgress(`Uploading 0/${totalFiles}...`);

    const uploadedPhotos: { id: string; url: string }[] = [];
    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop();
      const path = `${uploadingEventId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("event-photos").upload(path, file);
      if (uploadError) { console.error("Upload error:", uploadError.message); continue; }

      const { data: urlData } = supabase.storage.from("event-photos").getPublicUrl(path);
      const { data: photoRow, error: insertErr } = await supabase
        .from("photos")
        .insert({ event_id: uploadingEventId, image_url: urlData.publicUrl })
        .select("id")
        .single();

      if (insertErr || !photoRow) continue;
      uploadedPhotos.push({ id: photoRow.id, url: urlData.publicUrl });
      uploaded++;
      setUploadProgress(`Uploaded ${uploaded}/${totalFiles}`);
    }

    let totalFaces = 0;
    setUploadProgress(`Detecting faces...`);
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
    setUploadingEventId(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    fetchEvents(user!.id);
    if (isAdmin) fetchGlobalStats();
  };

  const myTotalPhotos = Object.values(photoCountMap).reduce((a, b) => a + b, 0);
  const approvedEvents = events.filter(e => e.status === "approved");

  const myStats = [
    { label: "My Events", value: String(events.length), icon: Calendar },
    { label: "Approved", value: String(approvedEvents.length), icon: CheckCircle },
    { label: "My Photos", value: String(myTotalPhotos), icon: Image },
    { label: "Pending", value: String(events.filter(e => e.status === "pending").length), icon: Clock },
  ];

  const globalStats = isAdmin ? [
    { label: "Total Users", value: String(users.length), icon: Users },
    { label: "Total Events", value: String(allEvents.length), icon: Calendar },
    { label: "Total Photos", value: String(totalPhotos), icon: Image },
    { label: "Total Faces", value: String(totalFacesCount), icon: Brain },
    { label: "Pending Approvals", value: String(pendingEvents.length), icon: Clock },
    { label: "Revenue Events", value: String(allEvents.filter(e => e.payment_status === "paid").length), icon: BarChart3 },
  ] : [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved": return <span className="inline-flex items-center gap-1 text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full"><CheckCircle className="w-3 h-3" />Approved</span>;
      case "rejected": return <span className="inline-flex items-center gap-1 text-xs bg-destructive/20 text-destructive px-2 py-0.5 rounded-full"><XCircle className="w-3 h-3" />Rejected</span>;
      default: return <span className="inline-flex items-center gap-1 text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full"><Clock className="w-3 h-3" />Pending</span>;
    }
  };

  const tabs: AdminTab[] = isAdmin ? ["events", "approvals", "users", "stats"] : ["events"];

  return (
    <div className="min-h-screen bg-gradient-dark">
      <Navbar />
      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />

      {/* Confirm single delete dialog */}
      <AnimatePresence>
        {confirmDeleteId && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full shadow-card">
              <AlertTriangle className="w-10 h-10 text-destructive mx-auto mb-4" />
              <h3 className="font-display font-semibold text-lg text-center mb-2">Confirm Delete</h3>
              <p className="text-muted-foreground text-sm text-center mb-6">
                Are you sure? This will permanently delete the event, all photos, face data, and notifications. This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <Button variant="ghost" className="flex-1" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
                <Button variant="destructive" className="flex-1" onClick={tab === "approvals" ? confirmRejectAndDelete : confirmDelete}>
                  <Trash2 className="w-4 h-4" />
                  Delete Everything
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bulk action confirmation dialog */}
      <AnimatePresence>
        {bulkAction && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full shadow-card">
              <AlertTriangle className="w-10 h-10 text-destructive mx-auto mb-4" />
              <h3 className="font-display font-semibold text-lg text-center mb-2">{bulkActionLabels[bulkAction]?.title}</h3>
              <p className="text-muted-foreground text-sm text-center mb-6">
                {bulkActionLabels[bulkAction]?.desc} This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <Button variant="ghost" className="flex-1" onClick={() => setBulkAction(null)} disabled={bulkDeleting}>Cancel</Button>
                <Button variant="destructive" className="flex-1" onClick={executeBulkAction} disabled={bulkDeleting}>
                  {bulkDeleting ? <><RefreshCw className="w-4 h-4 animate-spin" /> Deleting...</> : <><Trash2 className="w-4 h-4" /> Confirm</>}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="container pt-20 pb-16">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pt-4">
          <div>
            <h1 className="font-display font-bold text-2xl md:text-3xl text-foreground">
              {isAdmin ? "Admin Panel" : "Event Management"}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {isAdmin ? "Manage events, users, approvals, and analytics" : "Create and manage your events"}
            </p>
          </div>
          <Button variant="hero" size="default" onClick={() => { setShowCreate(!showCreate); setShowPayment(false); }}>
            <Plus className="w-4 h-4" />
            Create Event
          </Button>
        </div>

        {uploadProgress && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 bg-primary/10 border border-primary/20 rounded-xl p-4 flex items-center gap-3">
            <Brain className="w-5 h-5 text-primary animate-pulse" />
            <span className="text-sm text-foreground font-display">{uploadProgress}</span>
          </motion.div>
        )}

        {showCreate && !showPayment && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mb-8 overflow-hidden">
            <div className="bg-gradient-card border border-border rounded-2xl p-6 shadow-card">
              <h3 className="font-display font-semibold text-lg mb-4">New Event</h3>
              <div className="grid md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="text-sm font-display font-medium text-foreground mb-1.5 block">Event Name</label>
                  <Input placeholder="e.g. Wedding Reception" value={newEvent.name} onChange={(e) => setNewEvent({ ...newEvent, name: e.target.value })} className="bg-secondary border-border text-foreground h-11" />
                </div>
                <div>
                  <label className="text-sm font-display font-medium text-foreground mb-1.5 block">Date</label>
                  <Input type="date" value={newEvent.date} onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })} className="bg-secondary border-border text-foreground h-11" />
                </div>
              </div>

              <h4 className="font-display font-medium text-foreground mb-3">Select a Plan</h4>
              <div className="grid md:grid-cols-3 gap-4 mb-6">
                {PLANS.map((plan) => (
                  <button
                    key={plan.id}
                    onClick={() => setSelectedPlan(plan.id)}
                    className={`relative border rounded-xl p-5 text-left transition-all ${selectedPlan === plan.id ? "border-primary bg-primary/10 shadow-gold" : "border-border bg-secondary hover:border-primary/40"}`}
                  >
                    <h5 className="font-display font-bold text-foreground text-lg">{plan.name}</h5>
                    <p className="text-muted-foreground text-sm mt-1">Max {plan.label || plan.photos.toLocaleString()} photos</p>
                    <p className="font-display font-bold text-primary text-xl mt-3">{plan.price}</p>
                    {selectedPlan === plan.id && (
                      <div className="absolute top-3 right-3"><CheckCircle className="w-5 h-5 text-primary" /></div>
                    )}
                  </button>
                ))}
              </div>

              <div className="flex gap-3">
                <Button variant="hero" size="default" onClick={handleProceedToPayment}>
                  <CreditCard className="w-4 h-4" /> Proceed to Payment
                </Button>
                <Button variant="ghost" size="default" onClick={() => setShowCreate(false)}>Cancel</Button>
              </div>
            </div>
          </motion.div>
        )}

        {showPayment && creatingEventData && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mb-8 overflow-hidden">
            <div className="bg-gradient-card border border-border rounded-2xl p-6 shadow-card max-w-md mx-auto text-center">
              <CreditCard className="w-10 h-10 text-primary mx-auto mb-4" />
              <h3 className="font-display font-semibold text-xl mb-2">Complete Payment</h3>
              <p className="text-muted-foreground text-sm mb-6">
                Pay via UPI to activate your <strong className="text-primary">{PLANS.find(p => p.id === creatingEventData.plan)?.name}</strong> plan
              </p>
              <div className="bg-foreground p-4 rounded-xl inline-block mb-4">
                <QRCodeSVG value={`upi://pay?pa=${UPI_NUMBER}@upi&pn=FotoOwl&am=${PLANS.find(p => p.id === creatingEventData.plan)?.price.replace(/[₹,]/g, '')}`} size={180} />
              </div>
              <p className="text-foreground font-display font-medium text-lg mb-1">UPI: {UPI_NUMBER}</p>
              <p className="text-muted-foreground text-sm mb-6">
                Amount: <strong className="text-primary">{PLANS.find(p => p.id === creatingEventData.plan)?.price}</strong>
              </p>
              <Button variant="hero" size="lg" className="w-full" onClick={handleIPaid} disabled={creating}>
                {creating ? "Creating Event..." : "✅ I Paid"}
              </Button>
              <Button variant="ghost" size="sm" className="w-full mt-2" onClick={() => setShowPayment(false)}>Back</Button>
            </div>
          </motion.div>
        )}

        {/* Global admin stats */}
        {isAdmin && globalStats.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            {globalStats.map((s, i) => (
              <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="bg-gradient-card border border-border rounded-xl p-4 shadow-card">
                <div className="flex items-center gap-2 mb-1">
                  <s.icon className="w-4 h-4 text-primary" />
                  <span className="text-xs text-muted-foreground font-display truncate">{s.label}</span>
                </div>
                <span className="font-display font-bold text-xl text-foreground">{s.value}</span>
              </motion.div>
            ))}
          </div>
        )}

        {/* Admin bulk actions */}
        {isAdmin && (
          <div className="flex flex-wrap gap-2 mb-6">
            <Button variant="glass" size="sm" className="border-destructive/30 text-destructive hover:bg-destructive/10" onClick={() => setBulkAction("delete-all-events")}>
              <Trash2 className="w-3.5 h-3.5" /> Delete All Events
            </Button>
            <Button variant="glass" size="sm" className="border-destructive/30 text-destructive hover:bg-destructive/10" onClick={() => setBulkAction("delete-all-photos")}>
              <Trash2 className="w-3.5 h-3.5" /> Delete All Photos
            </Button>
            <Button variant="glass" size="sm" className="border-destructive/30 text-destructive hover:bg-destructive/10" onClick={() => setBulkAction("reset-app")}>
              <AlertTriangle className="w-3.5 h-3.5" /> Reset App Data
            </Button>
          </div>
        )}

        {/* My stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {myStats.map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-gradient-card border border-border rounded-xl p-5 shadow-card">
              <div className="flex items-center gap-3 mb-2">
                <s.icon className="w-5 h-5 text-primary" />
                <span className="text-xs text-muted-foreground font-display">{s.label}</span>
              </div>
              <span className="font-display font-bold text-2xl text-foreground">{s.value}</span>
            </motion.div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex bg-secondary rounded-xl p-1 mb-8 max-w-md overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t}
              className={`flex-1 text-sm font-display font-medium py-2.5 rounded-lg transition-all capitalize whitespace-nowrap px-3 ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>

        {/* EVENTS TAB */}
        {tab === "events" && (
          <>
            {loading ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map(i => (
                  <div key={i} className="rounded-2xl overflow-hidden">
                    <Skeleton className="h-48 w-full" />
                    <div className="p-4 space-y-2">
                      <Skeleton className="h-5 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : events.length === 0 ? (
              <div className="text-center py-12">
                <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-display font-semibold text-lg mb-2">No events yet</h3>
                <p className="text-muted-foreground text-sm mb-4">Create your first event to get started</p>
                <Button variant="hero" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" /> Create Event</Button>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {(isAdmin ? allEvents : events).map((event) => (
                  <motion.div key={event.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="relative group">
                    {event.status === "pending" && (
                      <div className="absolute inset-0 z-10 bg-background/70 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center">
                        <Clock className="w-8 h-8 text-yellow-400 mb-2" />
                        <p className="font-display font-medium text-foreground">Waiting for approval ⏳</p>
                      </div>
                    )}
                    {event.status === "rejected" && (
                      <div className="absolute inset-0 z-10 bg-background/70 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center">
                        <XCircle className="w-8 h-8 text-destructive mb-2" />
                        <p className="font-display font-medium text-foreground">Payment not verified ❌</p>
                      </div>
                    )}
                    <EventCard
                      id={event.id}
                      name={event.name}
                      date={event.date || event.created_at}
                      coverImage={event.cover_image || undefined}
                      guestCount={0}
                      photoCount={photoCountMap[event.id] || 0}
                      eventCode={event.event_code}
                    />
                    <div className="absolute top-3 left-3 z-20">{getStatusBadge(event.status)}</div>
                    <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                      {event.status === "approved" && (
                        <button onClick={() => { setUploadingEventId(event.id); fileInputRef.current?.click(); }} className="p-2 bg-primary rounded-lg text-primary-foreground hover:bg-primary/80 transition-colors" title="Upload photos">
                          <Upload className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => handleDeleteEvent(event.id)} className="p-2 bg-destructive rounded-lg text-destructive-foreground hover:bg-destructive/80 transition-colors" title="Delete event">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </>
        )}

        {/* APPROVALS TAB */}
        {tab === "approvals" && isAdmin && (
          <div className="space-y-4">
            {pendingEvents.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-display font-semibold text-lg mb-2">All caught up!</h3>
                <p className="text-muted-foreground text-sm">No pending events to review</p>
              </div>
            ) : (
              pendingEvents.map((event) => (
                <motion.div key={event.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-card border border-border rounded-2xl p-6 shadow-card">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h4 className="font-display font-semibold text-foreground text-lg">{event.name}</h4>
                      <div className="flex flex-wrap gap-3 mt-2 text-sm text-muted-foreground">
                        <span>Plan: <strong className="text-primary">{PLANS.find(p => p.id === event.selected_plan)?.name || event.selected_plan}</strong></span>
                        <span>Code: <strong className="text-foreground">{event.event_code}</strong></span>
                        {event.date && <span>Date: {new Date(event.date).toLocaleDateString()}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Created: {new Date(event.created_at).toLocaleString()}</p>
                    </div>
                    <div className="flex gap-3">
                      <Button variant="hero" size="sm" onClick={() => handleApprove(event.id)}>
                        <CheckCircle className="w-4 h-4" /> Approve
                      </Button>
                      <Button variant="glass" size="sm" onClick={() => handleReject(event.id)} className="border-destructive/50 text-destructive hover:bg-destructive/10">
                        <XCircle className="w-4 h-4" /> Reject & Delete
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        )}

        {/* USERS TAB */}
        {tab === "users" && isAdmin && (
          <div className="space-y-3">
            {users.length === 0 ? (
              <div className="text-center py-12">
                <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-display font-semibold text-lg">No users yet</h3>
              </div>
            ) : (
              <>
                <div className="text-sm text-muted-foreground mb-4">{users.length} registered users</div>
                {users.map((u) => (
                  <motion.div key={u.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-gradient-card border border-border rounded-xl p-4 shadow-card flex items-center justify-between">
                    <div>
                      <p className="font-display font-medium text-foreground">{u.display_name || "Unnamed"}</p>
                      <p className="text-xs text-muted-foreground">{u.phone || "No phone"} · Joined {new Date(u.created_at).toLocaleDateString()}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-display ${u.role === "admin" ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"}`}>
                      {u.role}
                    </span>
                  </motion.div>
                ))}
              </>
            )}
          </div>
        )}

        {/* STATS TAB */}
        {tab === "stats" && isAdmin && (
          <div className="space-y-6">
            <div className="bg-gradient-card border border-border rounded-2xl p-6 shadow-card">
              <h3 className="font-display font-semibold text-lg text-foreground mb-4">Platform Overview</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                <div>
                  <p className="text-muted-foreground text-sm">Total Users</p>
                  <p className="font-display font-bold text-3xl text-foreground">{users.length}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-sm">Total Events</p>
                  <p className="font-display font-bold text-3xl text-foreground">{allEvents.length}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-sm">Total Photos</p>
                  <p className="font-display font-bold text-3xl text-foreground">{totalPhotos}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-sm">Faces Detected</p>
                  <p className="font-display font-bold text-3xl text-primary">{totalFacesCount}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-sm">Approved Events</p>
                  <p className="font-display font-bold text-3xl text-green-400">{allEvents.filter(e => e.status === "approved").length}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-sm">Pending Events</p>
                  <p className="font-display font-bold text-3xl text-yellow-400">{pendingEvents.length}</p>
                </div>
              </div>
            </div>

            <div className="bg-gradient-card border border-border rounded-2xl p-6 shadow-card">
              <h3 className="font-display font-semibold text-lg text-foreground mb-4">Recent Events</h3>
              <div className="space-y-3">
                {allEvents.slice(0, 10).map(ev => (
                  <div key={ev.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div>
                      <p className="font-display font-medium text-foreground text-sm">{ev.name}</p>
                      <p className="text-xs text-muted-foreground">{new Date(ev.created_at).toLocaleDateString()} · {ev.selected_plan}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(ev.status)}
                      <Button variant="ghost" size="sm" onClick={() => navigate(`/event/${ev.event_code}`)}>
                        <Eye className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Admin;
