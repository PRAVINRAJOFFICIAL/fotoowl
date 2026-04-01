import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Calendar, CheckCircle, XCircle, Clock, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import EventCard from "@/components/EventCard";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface EventRow {
  id: string;
  name: string;
  date: string | null;
  event_code: string;
  cover_image: string | null;
  created_at: string;
  selected_plan: string;
  payment_status: string;
  status: string;
}

const MyEvents = () => {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [photoCountMap, setPhotoCountMap] = useState<Record<string, number>>({});
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) fetchEvents();
    else setLoading(false);
  }, [user]);

  const fetchEvents = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("created_by", user!.id)
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
      <div className="container pt-20 pb-16">
        <div className="flex items-center gap-4 mb-8 pt-4">
          <Link to="/" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="font-display font-bold text-2xl md:text-3xl text-foreground">My Events</h1>
            <p className="text-muted-foreground text-sm mt-1">All events you've created</p>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading events...</div>
        ) : events.length === 0 ? (
          <div className="text-center py-12">
            <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-display font-semibold text-lg mb-2">No events yet</h3>
            <p className="text-muted-foreground text-sm mb-4">Create your first event to get started</p>
            <Button variant="hero" onClick={() => navigate("/create-event")}>Create Event</Button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.map((event) => (
              <div key={event.id} className="relative group">
                {event.status === "pending" && (
                  <div className="absolute inset-0 z-10 bg-background/70 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center">
                    <Clock className="w-8 h-8 text-yellow-400 mb-2" />
                    <p className="font-display font-medium text-foreground">Waiting for admin approval ⏳</p>
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
                <div className="absolute top-3 left-3 z-20">
                  {getStatusBadge(event.status)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MyEvents;
