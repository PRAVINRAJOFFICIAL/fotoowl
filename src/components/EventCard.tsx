import { Calendar, Users, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface EventCardProps {
  id: string;
  name: string;
  date: string;
  coverImage?: string;
  guestCount: number;
  photoCount: number;
  eventCode: string;
}

const EventCard = ({ id, name, date, coverImage, guestCount, photoCount, eventCode }: EventCardProps) => {
  const navigate = useNavigate();

  return (
    <div className="bg-gradient-card border border-border rounded-2xl overflow-hidden shadow-card group hover:border-primary/30 transition-all duration-300">
      <div className="relative h-48 overflow-hidden">
        {coverImage ? (
          <img src={coverImage} alt={name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
        ) : (
          <div className="w-full h-full bg-secondary flex items-center justify-center">
            <Image className="w-12 h-12 text-muted-foreground" />
          </div>
        )}
        <div className="absolute top-3 right-3 bg-background/80 backdrop-blur-sm text-foreground text-xs font-display font-medium px-3 py-1 rounded-full">
          {eventCode}
        </div>
      </div>
      <div className="p-5">
        <h3 className="font-display font-semibold text-foreground text-lg mb-2 truncate">{name}</h3>
        <div className="flex items-center gap-4 text-muted-foreground text-sm mb-4">
          <span className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            {new Date(date).toLocaleDateString()}
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            {guestCount}
          </span>
          <span className="flex items-center gap-1.5">
            <Image className="w-3.5 h-3.5" />
            {photoCount}
          </span>
        </div>
        <Button variant="outline" size="sm" className="w-full" onClick={() => navigate(`/event/${id}`)}>
          View Event
        </Button>
      </div>
    </div>
  );
};

export default EventCard;
