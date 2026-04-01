import { useState } from "react";
import { motion } from "framer-motion";
import { CreditCard, CheckCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link, useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { QRCodeSVG } from "qrcode.react";

const PLANS = [
  { id: "basic", name: "Basic", photos: 100, price: "₹499" },
  { id: "standard", name: "Standard", photos: 10000, price: "₹1,999" },
  { id: "premium", name: "Premium", photos: Infinity, price: "₹4,999", label: "Unlimited" },
];

const UPI_NUMBER = "9363237647";

const CreateEvent = () => {
  const [step, setStep] = useState<"form" | "payment">("form");
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [selectedPlan, setSelectedPlan] = useState("basic");
  const [creating, setCreating] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  const generateEventCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
  };

  const handleProceedToPayment = () => {
    if (!name.trim()) {
      toast({ title: "Error", description: "Event name is required", variant: "destructive" });
      return;
    }
    setStep("payment");
  };

  const handleIPaid = async () => {
    if (!user) return;
    setCreating(true);
    const eventCode = generateEventCode();
    const { error } = await supabase.from("events").insert({
      name: name.trim(),
      date: date || null,
      event_code: eventCode,
      created_by: user.id,
      selected_plan: selectedPlan,
      payment_status: "pending",
      status: "pending",
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Event Created!", description: "Waiting for admin approval." });
      navigate("/my-events");
    }
    setCreating(false);
  };

  const plan = PLANS.find(p => p.id === selectedPlan)!;

  return (
    <div className="min-h-screen bg-gradient-dark">
      <Navbar />
      <div className="container pt-20 pb-16">
        <div className="flex items-center gap-4 mb-8 pt-4">
          <Link to="/" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="font-display font-bold text-2xl md:text-3xl text-foreground">Create Event</h1>
            <p className="text-muted-foreground text-sm mt-1">Set up your event and select a plan</p>
          </div>
        </div>

        {step === "form" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto">
            <div className="bg-gradient-card border border-border rounded-2xl p-6 shadow-card">
              <h3 className="font-display font-semibold text-lg mb-4">Event Details</h3>
              <div className="grid md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="text-sm font-display font-medium text-foreground mb-1.5 block">Event Name</label>
                  <Input placeholder="e.g. Wedding Reception" value={name} onChange={(e) => setName(e.target.value)} className="bg-secondary border-border text-foreground h-11" />
                </div>
                <div>
                  <label className="text-sm font-display font-medium text-foreground mb-1.5 block">Date</label>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-secondary border-border text-foreground h-11" />
                </div>
              </div>

              <h4 className="font-display font-medium text-foreground mb-3">Select a Plan</h4>
              <div className="grid md:grid-cols-3 gap-4 mb-6">
                {PLANS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPlan(p.id)}
                    className={`relative border rounded-xl p-5 text-left transition-all ${selectedPlan === p.id ? "border-primary bg-primary/10 shadow-gold" : "border-border bg-secondary hover:border-primary/40"}`}
                  >
                    <h5 className="font-display font-bold text-foreground text-lg">{p.name}</h5>
                    <p className="text-muted-foreground text-sm mt-1">Max {p.label || p.photos.toLocaleString()} photos</p>
                    <p className="font-display font-bold text-primary text-xl mt-3">{p.price}</p>
                    {selectedPlan === p.id && (
                      <div className="absolute top-3 right-3"><CheckCircle className="w-5 h-5 text-primary" /></div>
                    )}
                  </button>
                ))}
              </div>

              <Button variant="hero" size="default" onClick={handleProceedToPayment}>
                <CreditCard className="w-4 h-4" />
                Proceed to Payment
              </Button>
            </div>
          </motion.div>
        )}

        {step === "payment" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-md mx-auto">
            <div className="bg-gradient-card border border-border rounded-2xl p-6 shadow-card text-center">
              <CreditCard className="w-10 h-10 text-primary mx-auto mb-4" />
              <h3 className="font-display font-semibold text-xl mb-2">Complete Payment</h3>
              <p className="text-muted-foreground text-sm mb-6">
                Pay via UPI to activate your <strong className="text-primary">{plan.name}</strong> plan
              </p>
              <div className="bg-foreground p-4 rounded-xl inline-block mb-4">
                <QRCodeSVG value={`upi://pay?pa=${UPI_NUMBER}@upi&pn=FotoOwl&am=${plan.price.replace(/[₹,]/g, '')}`} size={180} />
              </div>
              <p className="text-foreground font-display font-medium text-lg mb-1">UPI: {UPI_NUMBER}</p>
              <p className="text-muted-foreground text-sm mb-6">
                Amount: <strong className="text-primary">{plan.price}</strong>
              </p>
              <Button variant="hero" size="lg" className="w-full" onClick={handleIPaid} disabled={creating}>
                {creating ? "Creating Event..." : "✅ I Paid"}
              </Button>
              <Button variant="ghost" size="sm" className="w-full mt-2" onClick={() => setStep("form")}>Back</Button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default CreateEvent;
