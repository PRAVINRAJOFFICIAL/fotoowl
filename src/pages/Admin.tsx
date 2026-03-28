import { useState } from "react";
import { motion } from "framer-motion";
import {
  Plus, Upload, Users, Image, BarChart3, Calendar, Trash2, Eye, QrCode, Settings
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Navbar from "@/components/Navbar";
import EventCard from "@/components/EventCard";
import { QRCodeSVG } from "qrcode.react";

type AdminTab = "events" | "analytics";

const mockEvents = [
  { id: "1", name: "Sarah & John's Wedding", date: "2024-03-15", guestCount: 124, photoCount: 487, eventCode: "WED2024", coverImage: "https://picsum.photos/seed/wed/600/400" },
  { id: "2", name: "College Fest 2024", date: "2024-04-20", guestCount: 342, photoCount: 1204, eventCode: "FEST24", coverImage: "https://picsum.photos/seed/fest/600/400" },
  { id: "3", name: "Corporate Meetup", date: "2024-05-10", guestCount: 56, photoCount: 189, eventCode: "CORP24", coverImage: "https://picsum.photos/seed/corp/600/400" },
];

const Admin = () => {
  const [tab, setTab] = useState<AdminTab>("events");
  const [showCreate, setShowCreate] = useState(false);
  const [newEvent, setNewEvent] = useState({ name: "", date: "" });

  const stats = [
    { label: "Total Events", value: "3", icon: Calendar },
    { label: "Total Photos", value: "1,880", icon: Image },
    { label: "Total Guests", value: "522", icon: Users },
    { label: "Downloads", value: "3,412", icon: BarChart3 },
  ];

  return (
    <div className="min-h-screen bg-gradient-dark">
      <Navbar />
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
                <Button variant="hero" size="default">Create Event</Button>
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
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {mockEvents.map((event) => (
              <EventCard key={event.id} {...event} />
            ))}
          </div>
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
