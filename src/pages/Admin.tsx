import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  Plus, Upload, Users, Image, BarChart3, Calendar, Trash2, LogIn
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Navbar from "@/components/Navbar";
import EventCard from "@/components/EventCard";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

type AdminTab = "events" | "analytics";

interface EventRow {
  id: string;
  name: string;
  date: string | null;
  event_code: string;
  cover_image: string | null;
  created_at: string;
}

const Admin = () => {
  const [tab, setTab] = useState<AdminTab>("events");
  const [showCreate, setShowCreate] = useState(false);
  const [newEvent, setNewEvent] = useState({ name: "", date: "" });
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [photoCountMap, setPhotoCountMap] = useState<Record<string, number>>({});
  const [uploadingEventId, setUploadingEventId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      if (data.user) fetchEvents(data.user.id);
      else setLoading(false);
    });
  }, []);

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
      setEvents(data || []);
      // Fetch photo counts
      if (data && data.length > 0) {
        const ids = data.map((e: EventRow) => e.id);
        const { data: photos } = await supabase
          .from("photos")
          .select("event_id")
          .in("event_id", ids);
        const counts: Record<string, number> = {};
        photos?.forEach((p: { event_id: string }) => {
          counts[p.event_id] = (counts[p.event_id] || 0) + 1;
        });
        setPhotoCountMap(counts);
      }
    }
    setLoading(false);
  };

  const generateEventCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
  };

  const handleCreateEvent = async () => {
    if (!newEvent.name.trim()) {
      toast({ title: "Error", description: "Event name is required", variant: "destructive" });
      return;
    }
    setCreating(true);
    const eventCode = generateEventCode();
    const { error } = await supabase.from("events").insert({
      name: newEvent.name.trim(),
      date: newEvent.date || null,
      event_code: eventCode,
      created_by: user.id,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Event Created!", description: `Code: ${eventCode}` });
      setNewEvent({ name: "", date: "" });
      setShowCreate(false);
      fetchEvents(user.id);
    }
    setCreating(false);
  };

  const handleDeleteEvent = async (eventId: string) => {
    const { error } = await supabase.from("events").delete().eq("id", eventId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Event deleted" });
      fetchEvents(user.id);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !uploadingEventId) return;

    const totalFiles = files.length;
    let uploaded = 0;

    toast({ title: "Uploading...", description: `0/${totalFiles} photos` });

    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop();
      const path = `${uploadingEventId}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("event-photos")
        .upload(path, file);

      if (uploadError) {
        toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
        continue;
      }

      const { data: urlData } = supabase.storage.from("event-photos").getPublicUrl(path);

      await supabase.from("photos").insert({
        event_id: uploadingEventId,
        image_url: urlData.publicUrl,
      });

      uploaded++;
    }

    toast({ title: "Upload Complete!", description: `${uploaded}/${totalFiles} photos uploaded` });
    setUploadingEventId(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    fetchEvents(user.id);
  };

  const totalPhotos = Object.values(photoCountMap).reduce((a, b) => a + b, 0);

  const stats = [
    { label: "Total Events", value: String(events.length), icon: Calendar },
    { label: "Total Photos", value: String(totalPhotos), icon: Image },
    { label: "Total Guests", value: "—", icon: Users },
    { label: "Downloads", value: "—", icon: BarChart3 },
  ];

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-dark">
        <Navbar />
        <div className="container pt-32 flex flex-col items-center text-center">
          <LogIn className="w-12 h-12 text-muted-foreground mb-4" />
          <h2 className="font-display font-bold text-2xl mb-2">Sign in to continue</h2>
          <p className="text-muted-foreground mb-6">You need to be logged in to manage events</p>
          <Button variant="hero" onClick={() => navigate("/login")}>Sign In</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-dark">
      <Navbar />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handlePhotoUpload}
      />
      <div className="container pt-20 pb-16">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pt-4">
          <div>
            <h1 className="font-display font-bold text-2xl md:text-3xl text-foreground">Admin Panel</h1>
            <p className="text-muted-foreground text-sm mt-1">Manage events, photos and guests</p>
          </div>
          <Button variant="hero" size="default" onClick={() => setShowCreate(!showCreate)}>
            <Plus className="w-4 h-4" />
            Create Event
          </Button>
        </div>

        {/* Create Event Form */}
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mb-8 overflow-hidden"
          >
            <div className="bg-gradient-card border border-border rounded-2xl p-6 shadow-card">
              <h3 className="font-display font-semibold text-lg mb-4">New Event</h3>
              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-sm font-display font-medium text-foreground mb-1.5 block">Event Name</label>
                  <Input
                    placeholder="e.g. Wedding Reception"
                    value={newEvent.name}
                    onChange={(e) => setNewEvent({ ...newEvent, name: e.target.value })}
                    className="bg-secondary border-border text-foreground h-11"
                  />
                </div>
                <div>
                  <label className="text-sm font-display font-medium text-foreground mb-1.5 block">Date</label>
                  <Input
                    type="date"
                    value={newEvent.date}
                    onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
                    className="bg-secondary border-border text-foreground h-11"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <Button variant="hero" size="default" onClick={handleCreateEvent} disabled={creating}>
                  {creating ? "Creating..." : "Create Event"}
                </Button>
                <Button variant="ghost" size="default" onClick={() => setShowCreate(false)}>Cancel</Button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-gradient-card border border-border rounded-xl p-5 shadow-card"
            >
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
          {(["events", "analytics"] as AdminTab[]).map((t) => (
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
                <Button variant="hero" onClick={() => setShowCreate(true)}>
                  <Plus className="w-4 h-4" /> Create Event
                </Button>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {events.map((event) => (
                  <div key={event.id} className="relative group">
                    <EventCard
                      id={event.id}
                      name={event.name}
                      date={event.date || event.created_at}
                      coverImage={event.cover_image || undefined}
                      guestCount={0}
                      photoCount={photoCountMap[event.id] || 0}
                      eventCode={event.event_code}
                    />
                    <div className="absolute top-3 left-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => {
                          setUploadingEventId(event.id);
                          fileInputRef.current?.click();
                        }}
                        className="p-2 bg-primary rounded-lg text-primary-foreground hover:bg-primary/80 transition-colors"
                        title="Upload photos"
                      >
                        <Upload className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteEvent(event.id)}
                        className="p-2 bg-destructive rounded-lg text-destructive-foreground hover:bg-destructive/80 transition-colors"
                        title="Delete event"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "analytics" && (
          <div className="bg-gradient-card border border-border rounded-2xl p-8 shadow-card text-center">
            <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-display font-semibold text-lg text-foreground mb-2">Analytics Coming Soon</h3>
            <p className="text-muted-foreground text-sm">Detailed insights about your events, downloads, and engagement</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Admin;
