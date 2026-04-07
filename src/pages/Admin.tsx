import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar, Trash2, CheckCircle, XCircle, Clock, CreditCard,
  Users, BarChart3, AlertTriangle, Eye, RefreshCw, Image
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import Navbar from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

type AdminTab = "approvals" | "events" | "users" | "stats";
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
  expiry_date: string | null;
}

interface ProfileRow {
  id: string;
  display_name: string | null;
  role: string;
  phone: string | null;
  created_at: string;
}

const PLANS = [
  { id: "basic", name: "Basic", price: "₹499" },
  { id: "standard", name: "Standard", price: "₹1,999" },
  { id: "premium", name: "Premium", price: "₹4,999" },
];

const Admin = () => {
  const [tab, setTab] = useState<AdminTab>("approvals");
  const [allEvents, setAllEvents] = useState<EventRow[]>([]);
  const [pendingEvents, setPendingEvents] = useState<EventRow[]>([]);
  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalPhotos, setTotalPhotos] = useState(0);
  const [totalFacesCount, setTotalFacesCount] = useState(0);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [bulkAction, setBulkAction] = useState<BulkAction>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();

  useEffect(() => {
    if (user && isAdmin) {
      fetchAll();
    } else {
      setLoading(false);
    }
  }, [user, isAdmin]);

  const fetchAll = async () => {
    setLoading(true);
    await Promise.all([fetchAllEvents(), fetchPendingEvents(), fetchUsers(), fetchGlobalStats()]);
    setLoading(false);
  };

  const fetchAllEvents = async () => {
    const { data } = await supabase.from("events").select("*").order("created_at", { ascending: false });
    setAllEvents((data as EventRow[]) || []);
  };

  const fetchPendingEvents = async () => {
    const { data } = await supabase.from("events").select("*").eq("status", "pending").order("created_at", { ascending: false });
    setPendingEvents((data as EventRow[]) || []);
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

  const handleApprove = async (eventId: string) => {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30);
    const { error } = await supabase.from("events").update({
      status: "approved",
      payment_status: "paid",
      expiry_date: expiryDate.toISOString(),
    }).eq("id", eventId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Event approved! ✅", description: "Active for 30 days." });
      fetchPendingEvents();
      fetchAllEvents();
    }
  };

  const handleExtendExpiry = async (eventId: string) => {
    // Find current expiry or use now
    const event = allEvents.find(e => e.id === eventId);
    const base = event?.expiry_date ? new Date(event.expiry_date) : new Date();
    const newExpiry = new Date(Math.max(base.getTime(), Date.now()));
    newExpiry.setDate(newExpiry.getDate() + 30);
    const { error } = await supabase.from("events").update({ expiry_date: newExpiry.toISOString() }).eq("id", eventId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Expiry extended by 30 days ✅" });
      fetchAllEvents();
    }
  };

  const handleReject = (eventId: string) => setConfirmDeleteId(eventId);

  const deleteEventCascade = async (eventId: string) => {
    const { data: photos } = await supabase.from("photos").select("id, image_url").eq("event_id", eventId);

    if (photos && photos.length > 0) {
      const photoIds = photos.map(p => p.id);
      for (let i = 0; i < photoIds.length; i += 100) {
        await supabase.from("faces").delete().in("photo_id", photoIds.slice(i, i + 100));
      }

      const storagePaths = photos
        .map(p => { const m = p.image_url.match(/event-photos\/(.+?)(\?|$)/); return m ? m[1] : null; })
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
      toast({ title: "Event deleted ❌" });
      fetchPendingEvents();
      fetchAllEvents();
      fetchGlobalStats();
    } catch {
      toast({ title: "Error deleting event", variant: "destructive" });
    }
  };

  // Bulk actions
  const handleBulkDeleteAllEvents = async () => {
    setBulkDeleting(true);
    try {
      const { data } = await supabase.from("events").select("id");
      if (data) for (const evt of data) await deleteEventCascade(evt.id);
      toast({ title: "All events deleted ✅" });
      fetchAll();
    } catch { toast({ title: "Error", variant: "destructive" }); }
    setBulkDeleting(false);
    setBulkAction(null);
  };

  const handleBulkDeleteAllPhotos = async () => {
    setBulkDeleting(true);
    try {
      const { data: facesData } = await supabase.from("faces").select("id");
      if (facesData && facesData.length > 0) {
        for (let i = 0; i < facesData.length; i += 100) {
          await supabase.from("faces").delete().in("id", facesData.slice(i, i + 100).map(f => f.id));
        }
      }
      const { data: photosData } = await supabase.from("photos").select("id, image_url");
      if (photosData && photosData.length > 0) {
        const paths = photosData.map(p => { const m = p.image_url.match(/event-photos\/(.+?)(\?|$)/); return m ? m[1] : null; }).filter(Boolean) as string[];
        for (let i = 0; i < paths.length; i += 100) await supabase.storage.from("event-photos").remove(paths.slice(i, i + 100));
        for (let i = 0; i < photosData.length; i += 100) await supabase.from("photos").delete().in("id", photosData.slice(i, i + 100).map(p => p.id));
      }
      toast({ title: "All photos deleted ✅" });
      fetchGlobalStats();
    } catch { toast({ title: "Error", variant: "destructive" }); }
    setBulkDeleting(false);
    setBulkAction(null);
  };

  const handleResetApp = async () => {
    setBulkDeleting(true);
    try {
      const { data } = await supabase.from("events").select("id");
      if (data) for (const evt of data) await deleteEventCascade(evt.id);
      toast({ title: "App reset complete ✅", description: "Users preserved." });
      fetchAll();
    } catch { toast({ title: "Error", variant: "destructive" }); }
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
    "delete-all-events": { title: "Delete All Events", desc: "Permanently delete ALL events, photos, face data, and notifications." },
    "delete-all-photos": { title: "Delete All Photos", desc: "Delete ALL photos from storage and database, and all face descriptors." },
    "reset-app": { title: "Reset App Data", desc: "Delete ALL events, photos, and face data. User accounts preserved." },
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved": return <span className="inline-flex items-center gap-1 text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full"><CheckCircle className="w-3 h-3" />Approved</span>;
      case "rejected": return <span className="inline-flex items-center gap-1 text-xs bg-destructive/20 text-destructive px-2 py-0.5 rounded-full"><XCircle className="w-3 h-3" />Rejected</span>;
      default: return <span className="inline-flex items-center gap-1 text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full"><Clock className="w-3 h-3" />Pending</span>;
    }
  };

  const globalStats = [
    { label: "Total Users", value: String(users.length), icon: Users },
    { label: "Total Events", value: String(allEvents.length), icon: Calendar },
    { label: "Total Photos", value: String(totalPhotos), icon: Image },
    { label: "Total Faces", value: String(totalFacesCount), icon: BarChart3 },
    { label: "Pending", value: String(pendingEvents.length), icon: Clock },
    { label: "Paid Events", value: String(allEvents.filter(e => e.payment_status === "paid").length), icon: CreditCard },
  ];

  const tabs: AdminTab[] = ["approvals", "events", "users", "stats"];

  return (
    <div className="min-h-screen bg-gradient-dark">
      <Navbar />

      {/* Confirm delete dialog */}
      <AnimatePresence>
        {confirmDeleteId && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full shadow-card">
              <AlertTriangle className="w-10 h-10 text-destructive mx-auto mb-4" />
              <h3 className="font-display font-semibold text-lg text-center mb-2">Reject & Delete Event?</h3>
              <p className="text-muted-foreground text-sm text-center mb-6">This will permanently delete the event, all photos, face data, and notifications. Cannot be undone.</p>
              <div className="flex gap-3">
                <Button variant="ghost" className="flex-1" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
                <Button variant="destructive" className="flex-1" onClick={confirmRejectAndDelete}>
                  <Trash2 className="w-4 h-4" /> Delete
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bulk action dialog */}
      <AnimatePresence>
        {bulkAction && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full shadow-card">
              <AlertTriangle className="w-10 h-10 text-destructive mx-auto mb-4" />
              <h3 className="font-display font-semibold text-lg text-center mb-2">{bulkActionLabels[bulkAction]?.title}</h3>
              <p className="text-muted-foreground text-sm text-center mb-6">{bulkActionLabels[bulkAction]?.desc} Cannot be undone.</p>
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
        <div className="mb-8 pt-4">
          <h1 className="font-display font-bold text-2xl md:text-3xl text-foreground">Admin Panel</h1>
          <p className="text-muted-foreground text-sm mt-1">Approve payments, view reports, and manage platform data</p>
        </div>

        {/* Global stats */}
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

        {/* Bulk actions */}
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

        {/* APPROVALS TAB */}
        {tab === "approvals" && (
          <div className="space-y-4">
            {loading ? (
              <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}</div>
            ) : pendingEvents.length === 0 ? (
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

        {/* EVENTS TAB (read-only overview) */}
        {tab === "events" && (
          <div className="space-y-3">
            {loading ? (
              <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
            ) : allEvents.length === 0 ? (
              <div className="text-center py-12">
                <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-display font-semibold text-lg">No events yet</h3>
              </div>
            ) : (
              allEvents.map(ev => {
                const isExpired = ev.expiry_date ? new Date(ev.expiry_date) < new Date() : false;
                const daysLeft = ev.expiry_date ? Math.ceil((new Date(ev.expiry_date).getTime() - Date.now()) / 86400000) : null;
                return (
                <motion.div key={ev.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-gradient-card border border-border rounded-xl p-4 shadow-card flex items-center justify-between">
                  <div>
                    <p className="font-display font-medium text-foreground">{ev.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(ev.created_at).toLocaleDateString()} · {ev.selected_plan} · Code: {ev.event_code}
                      {daysLeft !== null && (
                        <span className={`ml-2 ${isExpired ? 'text-destructive' : 'text-primary'}`}>
                          {isExpired ? '🔴 Expired' : `🟢 ${daysLeft}d left`}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(ev.status)}
                    {ev.status === "approved" && (
                      <Button variant="ghost" size="sm" className="text-primary hover:bg-primary/10" onClick={() => handleExtendExpiry(ev.id)} title="Extend 30 days">
                        <RefreshCw className="w-3 h-3" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => navigate(`/event/${ev.event_code}`)}>
                      <Eye className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => setConfirmDeleteId(ev.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </motion.div>
                );
              )
            )}
          </div>
        )}

        {/* USERS TAB */}
        {tab === "users" && (
          <div className="space-y-3">
            {loading ? (
              <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
            ) : users.length === 0 ? (
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
        {tab === "stats" && (
          <div className="space-y-6">
            <div className="bg-gradient-card border border-border rounded-2xl p-6 shadow-card">
              <h3 className="font-display font-semibold text-lg text-foreground mb-4">Platform Overview</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                <div><p className="text-muted-foreground text-sm">Total Users</p><p className="font-display font-bold text-3xl text-foreground">{users.length}</p></div>
                <div><p className="text-muted-foreground text-sm">Total Events</p><p className="font-display font-bold text-3xl text-foreground">{allEvents.length}</p></div>
                <div><p className="text-muted-foreground text-sm">Total Photos</p><p className="font-display font-bold text-3xl text-foreground">{totalPhotos}</p></div>
                <div><p className="text-muted-foreground text-sm">Faces Detected</p><p className="font-display font-bold text-3xl text-primary">{totalFacesCount}</p></div>
                <div><p className="text-muted-foreground text-sm">Approved</p><p className="font-display font-bold text-3xl text-green-400">{allEvents.filter(e => e.status === "approved").length}</p></div>
                <div><p className="text-muted-foreground text-sm">Pending</p><p className="font-display font-bold text-3xl text-yellow-400">{pendingEvents.length}</p></div>
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
