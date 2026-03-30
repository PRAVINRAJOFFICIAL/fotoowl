import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  Plus, Upload, Users, Image, BarChart3, Calendar, Trash2, Brain, CheckCircle, XCircle, Clock, CreditCard
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Navbar from "@/components/Navbar";
import EventCard from "@/components/EventCard";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { detectFaces } from "@/lib/faceRecognition";
import { useAuth } from "@/contexts/AuthContext";
import { QRCodeSVG } from "qrcode.react";

type AdminTab = "events" | "approvals";

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
  const [pendingEvents, setPendingEvents] = useState<PendingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [photoCountMap, setPhotoCountMap] = useState<Record<string, number>>({});
  const [uploadingEventId, setUploadingEventId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();

  useEffect(() => {
    if (user) {
      if (isAdmin) {
        fetchAllPendingEvents();
      }
      fetchEvents(user.id);
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

  const fetchAllPendingEvents = async () => {
    const { data } = await supabase
      .from("events")
      .select("*")
      .in("status", ["pending"])
      .order("created_at", { ascending: false });
    setPendingEvents((data as PendingEvent[]) || []);
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
      toast({ title: "Event Created!", description: "Waiting for admin approval. You'll get access once verified." });
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
    }
  };

  const handleReject = async (eventId: string) => {
    const { error } = await supabase.from("events").update({ status: "rejected", payment_status: "rejected" }).eq("id", eventId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Event rejected ❌" });
      fetchAllPendingEvents();
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    const { error } = await supabase.from("events").delete().eq("id", eventId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Event deleted" });
      fetchEvents(user!.id);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !uploadingEventId) return;

    // Check plan limit
    const ev = events.find(x => x.id === uploadingEventId);
    const plan = PLANS.find(p => p.id === ev?.selected_plan);
    const currentCount = photoCountMap[uploadingEventId] || 0;

    if (plan && plan.photos !== Infinity && currentCount + files.length > plan.photos) {
      toast({ title: "Plan limit reached", description: `Your ${plan.name} plan allows max ${plan.photos} photos. You have ${currentCount} uploaded.`, variant: "destructive" });
      return;
    }

    const totalFiles = files.length;
    let uploaded = 0;
    let facesDetected = 0;

    setUploadProgress(`Uploading 0/${totalFiles}...`);

    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop();
      const path = `${uploadingEventId}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage.from("event-photos").upload(path, file);
      if (uploadError) { console.error("Upload error:", uploadError.message); continue; }

      const { data: urlData } = supabase.storage.from("event-photos").getPublicUrl(path);
      const imageUrl = urlData.publicUrl;

      const { data: photoRow, error: insertErr } = await supabase
        .from("photos")
        .insert({ event_id: uploadingEventId, image_url: imageUrl })
        .select("id")
        .single();

      if (insertErr || !photoRow) { console.error("Photo insert error:", insertErr?.message); continue; }

      uploaded++;
      setUploadProgress(`Uploading ${uploaded}/${totalFiles} — Detecting faces...`);

      try {
        const descriptors = await detectFaces(imageUrl);
        for (const desc of descriptors) {
          await supabase.from("faces").insert({ photo_id: photoRow.id, descriptor: Array.from(desc) });
          facesDetected++;
        }
      } catch (err) {
        console.warn("Face detection failed for a photo, skipping:", err);
      }
    }

    setUploadProgress(null);
    toast({ title: "Upload Complete!", description: `${uploaded}/${totalFiles} photos uploaded, ${facesDetected} faces detected` });
    setUploadingEventId(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    fetchEvents(user!.id);
  };

  const totalPhotos = Object.values(photoCountMap).reduce((a, b) => a + b, 0);
  const approvedEvents = events.filter(e => e.status === "approved");

  const stats = [
    { label: "Total Events", value: String(events.length), icon: Calendar },
    { label: "Approved", value: String(approvedEvents.length), icon: CheckCircle },
    { label: "Total Photos", value: String(totalPhotos), icon: Image },
    { label: "Pending", value: String(events.filter(e => e.status === "pending").length), icon: Clock },
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved": return <span className="inline-flex items-center gap-1 text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full"><CheckCircle className="w-3 h-3" />Approved</span>;
      case "rejected": return <span className="inline-flex items-center gap-1 text-xs bg-destructive/20 text-destructive px-2 py-0.5 rounded-full"><XCircle className="w-3 h-3" />Rejected</span>;
      default: return <span className="inline-flex items-center gap-1 text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full"><Clock className="w-3 h-3" />Pending</span>;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-dark">
      <Navbar />
      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />
      <div className="container pt-20 pb-16">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pt-4">
          <div>
            <h1 className="font-display font-bold text-2xl md:text-3xl text-foreground">
              {isAdmin ? "Admin Panel" : "Event Management"}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {isAdmin ? "Manage events, approvals, and photos" : "Create and manage your events"}
            </p>
          </div>
          <Button variant="hero" size="default" onClick={() => { setShowCreate(!showCreate); setShowPayment(false); }}>
            <Plus className="w-4 h-4" />
            Create Event
          </Button>
        </div>

        {/* Upload progress banner */}
        {uploadProgress && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 bg-primary/10 border border-primary/20 rounded-xl p-4 flex items-center gap-3">
            <Brain className="w-5 h-5 text-primary animate-pulse" />
            <span className="text-sm text-foreground font-display">{uploadProgress}</span>
          </motion.div>
        )}

        {/* Create Event Form with Plan Selection */}
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

              {/* Plan Selection */}
              <h4 className="font-display font-medium text-foreground mb-3">Select a Plan</h4>
              <div className="grid md:grid-cols-3 gap-4 mb-6">
                {PLANS.map((plan) => (
                  <button
                    key={plan.id}
                    onClick={() => setSelectedPlan(plan.id)}
                    className={`relative border rounded-xl p-5 text-left transition-all ${selectedPlan === plan.id ? "border-primary bg-primary/10 shadow-gold" : "border-border bg-secondary hover:border-primary/40"}`}
                  >
                    <h5 className="font-display font-bold text-foreground text-lg">{plan.name}</h5>
                    <p className="text-muted-foreground text-sm mt-1">
                      Max {plan.label || plan.photos.toLocaleString()} photos
                    </p>
                    <p className="font-display font-bold text-primary text-xl mt-3">{plan.price}</p>
                    {selectedPlan === plan.id && (
                      <div className="absolute top-3 right-3">
                        <CheckCircle className="w-5 h-5 text-primary" />
                      </div>
                    )}
                  </button>
                ))}
              </div>

              <div className="flex gap-3">
                <Button variant="hero" size="default" onClick={handleProceedToPayment}>
                  <CreditCard className="w-4 h-4" />
                  Proceed to Payment
                </Button>
                <Button variant="ghost" size="default" onClick={() => setShowCreate(false)}>Cancel</Button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Payment Screen */}
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
              <Button variant="ghost" size="sm" className="w-full mt-2" onClick={() => { setShowPayment(false); }}>
                Back
              </Button>
            </div>
          </motion.div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {stats.map((s, i) => (
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
        <div className="flex bg-secondary rounded-xl p-1 mb-8 max-w-xs">
          {(isAdmin ? ["events", "approvals"] as AdminTab[] : ["events"] as AdminTab[]).map((t) => (
            <button
              key={t}
              className={`flex-1 text-sm font-display font-medium py-2.5 rounded-lg transition-all capitalize ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "events" && (
          <>
            {loading ? (
              <div className="text-center py-12 text-muted-foreground">Loading events...</div>
            ) : events.length === 0 ? (
              <div className="text-center py-12">
                <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-display font-semibold text-lg mb-2">No events yet</h3>
                <p className="text-muted-foreground text-sm mb-4">Create your first event to get started</p>
                <Button variant="hero" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" /> Create Event</Button>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {events.map((event) => (
                  <div key={event.id} className="relative group">
                    {/* Status overlay */}
                    {event.status === "pending" && (
                      <div className="absolute inset-0 z-10 bg-background/70 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center">
                        <Clock className="w-8 h-8 text-yellow-400 mb-2" />
                        <p className="font-display font-medium text-foreground">Waiting for admin approval ⏳</p>
                        <p className="text-muted-foreground text-xs mt-1">Payment verification in progress</p>
                      </div>
                    )}
                    {event.status === "rejected" && (
                      <div className="absolute inset-0 z-10 bg-background/70 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center">
                        <XCircle className="w-8 h-8 text-destructive mb-2" />
                        <p className="font-display font-medium text-foreground">Payment not verified ❌</p>
                        <p className="text-muted-foreground text-xs mt-1">Contact support for help</p>
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
                    <div className="absolute top-3 left-3 z-20">
                      {getStatusBadge(event.status)}
                    </div>
                    {event.status === "approved" && (
                      <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                        <button onClick={() => { setUploadingEventId(event.id); fileInputRef.current?.click(); }} className="p-2 bg-primary rounded-lg text-primary-foreground hover:bg-primary/80 transition-colors" title="Upload photos">
                          <Upload className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDeleteEvent(event.id)} className="p-2 bg-destructive rounded-lg text-destructive-foreground hover:bg-destructive/80 transition-colors" title="Delete event">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Admin Approvals Tab */}
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
                      <p className="text-xs text-muted-foreground mt-1">
                        Created: {new Date(event.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <Button variant="hero" size="sm" onClick={() => handleApprove(event.id)}>
                        <CheckCircle className="w-4 h-4" />
                        Approve
                      </Button>
                      <Button variant="glass" size="sm" onClick={() => handleReject(event.id)} className="border-destructive/50 text-destructive hover:bg-destructive/10">
                        <XCircle className="w-4 h-4" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Admin;
