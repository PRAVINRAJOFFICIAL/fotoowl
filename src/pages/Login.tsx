import { useState } from "react";
import { motion } from "framer-motion";
import { LogIn, Phone, ArrowRight, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Navbar from "@/components/Navbar";
import OwlLogo from "@/components/OwlLogo";

type AuthMode = "login" | "register" | "otp";

const Login = () => {
  const [mode, setMode] = useState<AuthMode>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);

  const handleSendOtp = () => {
    if (phone.trim()) setOtpSent(true);
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
            {/* Tab switcher */}
            <div className="flex bg-secondary rounded-xl p-1 mb-6">
              {(["login", "register", "otp"] as AuthMode[]).map((m) => (
                <button
                  key={m}
                  className={`flex-1 text-xs font-display font-medium py-2 rounded-lg transition-all ${mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => setMode(m)}
                >
                  {m === "otp" ? "Phone OTP" : m === "login" ? "Sign In" : "Register"}
                </button>
              ))}
            </div>

            {mode === "otp" ? (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-display font-medium text-foreground mb-1.5 block">Phone Number</label>
                  <Input
                    placeholder="+91 9876543210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="bg-secondary border-border text-foreground h-11"
                  />
                </div>
                {otpSent && (
                  <div>
                    <label className="text-sm font-display font-medium text-foreground mb-1.5 block">Enter OTP</label>
                    <Input
                      placeholder="6-digit code"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      maxLength={6}
                      className="bg-secondary border-border text-foreground h-11 text-center tracking-[0.5em] font-display text-lg"
                    />
                  </div>
                )}
                <Button variant="hero" size="lg" className="w-full" onClick={otpSent ? undefined : handleSendOtp}>
                  <Phone className="w-4 h-4" />
                  {otpSent ? "Verify OTP" : "Send OTP"}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {mode === "register" && (
                  <div>
                    <label className="text-sm font-display font-medium text-foreground mb-1.5 block">Full Name</label>
                    <Input
                      placeholder="John Doe"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="bg-secondary border-border text-foreground h-11"
                    />
                  </div>
                )}
                <div>
                  <label className="text-sm font-display font-medium text-foreground mb-1.5 block">Email</label>
                  <Input
                    type="email"
                    placeholder="you@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-secondary border-border text-foreground h-11"
                  />
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
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Button variant="hero" size="lg" className="w-full">
                  <LogIn className="w-4 h-4" />
                  {mode === "login" ? "Sign In" : "Create Account"}
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Login;
