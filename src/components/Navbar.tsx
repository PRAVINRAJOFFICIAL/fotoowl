import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Menu, X, LogIn, LogOut, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import OwlLogo from "./OwlLogo";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const Navbar = () => {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();

  useEffect(() => {
    if (!user) return;
    const fetchNotifications = async () => {
      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("read", false);
      setUnreadCount(count || 0);
    };
    fetchNotifications();

    // Subscribe to new notifications
    const channel = supabase
      .channel("notifications")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => {
        fetchNotifications();
        toast({ title: "🎉 New photos of you are available!" });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({ title: "Signed out" });
    navigate("/");
  };

  const handleNotificationClick = async () => {
    if (unreadCount > 0 && user) {
      await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
      setUnreadCount(0);
    }
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
      <div className="container flex items-center justify-between h-16">
        <Link to="/" onClick={() => setOpen(false)}>
          <OwlLogo size="sm" />
        </Link>

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-6">
          <Link to="/join" className="text-sm text-muted-foreground hover:text-foreground transition-colors font-display">Join Event</Link>
          {user && (
            <Link to="/admin" className="text-sm text-muted-foreground hover:text-foreground transition-colors font-display">
              {isAdmin ? "Admin" : "My Events"}
            </Link>
          )}
          {user && (
            <button onClick={handleNotificationClick} className="relative text-muted-foreground hover:text-foreground transition-colors">
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>
          )}
          {user ? (
            <Button variant="glass" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4" />
              Sign Out
            </Button>
          ) : (
            <Button variant="hero" size="sm" onClick={() => navigate("/login")}>
              <LogIn className="w-4 h-4" />
              Sign In
            </Button>
          )}
        </div>

        {/* Mobile toggle */}
        <button className="md:hidden text-foreground" onClick={() => setOpen(!open)}>
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden bg-background border-b border-border px-6 pb-6 space-y-4">
          <Link to="/join" onClick={() => setOpen(false)} className="block text-sm text-muted-foreground hover:text-foreground font-display">Join Event</Link>
          {user && (
            <Link to="/admin" onClick={() => setOpen(false)} className="block text-sm text-muted-foreground hover:text-foreground font-display">
              {isAdmin ? "Admin" : "My Events"}
            </Link>
          )}
          {user ? (
            <Button variant="glass" size="sm" className="w-full" onClick={() => { handleLogout(); setOpen(false); }}>
              <LogOut className="w-4 h-4" />
              Sign Out
            </Button>
          ) : (
            <Button variant="hero" size="sm" className="w-full" onClick={() => { navigate("/login"); setOpen(false); }}>
              <LogIn className="w-4 h-4" />
              Sign In
            </Button>
          )}
        </div>
      )}
    </nav>
  );
};

export default Navbar;
