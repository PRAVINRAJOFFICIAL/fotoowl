import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Menu, X, LogIn, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import OwlLogo from "./OwlLogo";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const Navbar = () => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({ title: "Signed out" });
    navigate("/");
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
          {isAdmin && (
            <Link to="/admin" className="text-sm text-muted-foreground hover:text-foreground transition-colors font-display">Admin</Link>
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
          {isAdmin && (
            <Link to="/admin" onClick={() => setOpen(false)} className="block text-sm text-muted-foreground hover:text-foreground font-display">Admin</Link>
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
