import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { LogIn, ArrowRight, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Navbar from "@/components/Navbar";
import OwlLogo from "@/components/OwlLogo";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

type AuthMode = "login" | "register";

const Login = () => {
  const [mode, setMode] = useState<AuthMode>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user, role } = useAuth();

  // Redirect if already logged in
  useEffect(() => {
    if (user && role) {
      navigate(role === "admin" ? "/admin" : "/", { replace: true });
    }
  }, [user, role, navigate]);

  const handleSubmit = async () => {
    if (!email || !password) {
      toast({ title: "Error", description: "Email and password are required", variant: "destructive" });
      return;
    }
    setLoading(true);

    if (mode === "register") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: name || email },
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Check your email", description: "We sent you a confirmation link" });
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Welcome back!" });
        // onAuthStateChange will handle the redirect
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-dark">
      <Navbar />
      <div className="container pt-24 pb-16 flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm"
        >
          <div className="flex justify-center mb-8">
            <OwlLogo size="lg" />
          </div>

          <div className="bg-gradient-card border border-border rounded-2xl p-8 shadow-card">
            <div className="flex bg-secondary rounded-xl p-1 mb-6">
              {(["login", "register"] as AuthMode[]).map((m) => (
                <button
                  key={m}
                  className={`flex-1 text-xs font-display font-medium py-2 rounded-lg transition-all ${mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => setMode(m)}
                >
                  {m === "login" ? "Sign In" : "Register"}
                </button>
              ))}
            </div>

            <div className="space-y-4">
              {mode === "register" && (
                <div>
                  <label className="text-sm font-display font-medium text-foreground mb-1.5 block">Full Name</label>
                  <Input placeholder="John Doe" value={name} onChange={(e) => setName(e.target.value)} className="bg-secondary border-border text-foreground h-11" />
                </div>
              )}
              <div>
                <label className="text-sm font-display font-medium text-foreground mb-1.5 block">Email</label>
                <Input type="email" placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className="bg-secondary border-border text-foreground h-11" />
              </div>
              <div>
                <label className="text-sm font-display font-medium text-foreground mb-1.5 block">Password</label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-secondary border-border text-foreground h-11 pr-10"
                    onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button variant="hero" size="lg" className="w-full" onClick={handleSubmit} disabled={loading}>
                <LogIn className="w-4 h-4" />
                {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
                {!loading && <ArrowRight className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Login;
