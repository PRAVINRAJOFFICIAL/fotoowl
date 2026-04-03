import { useState } from "react";
import { X, ZoomIn, ZoomOut, Download, Share2, Heart, ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface PhotoLightboxProps {
  photos: { id: string; image_url: string }[];
  initialIndex: number;
  onClose: () => void;
  onDownload: (url: string, index: number) => void;
  onShare: (url: string) => void;
  onFavorite?: (id: string) => void;
  favorites?: Set<string>;
  eventName?: string;
}

const PhotoLightbox = ({ photos, initialIndex, onClose, onDownload, onShare, onFavorite, favorites, eventName }: PhotoLightboxProps) => {
  const [index, setIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const photo = photos[index];

  const prev = () => { setIndex(i => (i > 0 ? i - 1 : photos.length - 1)); setZoom(1); };
  const next = () => { setIndex(i => (i < photos.length - 1 ? i + 1 : 0)); setZoom(1); };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl flex flex-col"
        onClick={onClose}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between p-4" onClick={e => e.stopPropagation()}>
          <span className="text-sm text-muted-foreground font-display">
            {index + 1} / {photos.length}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => setZoom(z => Math.min(z + 0.5, 3))} className="p-2 rounded-lg bg-secondary text-foreground hover:bg-secondary/80">
              <ZoomIn className="w-4 h-4" />
            </button>
            <button onClick={() => setZoom(z => Math.max(z - 0.5, 1))} className="p-2 rounded-lg bg-secondary text-foreground hover:bg-secondary/80">
              <ZoomOut className="w-4 h-4" />
            </button>
            {onFavorite && (
              <button onClick={() => onFavorite(photo.id)} className="p-2 rounded-lg bg-secondary text-foreground hover:bg-secondary/80">
                <Heart className={`w-4 h-4 ${favorites?.has(photo.id) ? "fill-primary text-primary" : ""}`} />
              </button>
            )}
            <button onClick={() => onShare(photo.image_url)} className="p-2 rounded-lg bg-secondary text-foreground hover:bg-secondary/80">
              <Share2 className="w-4 h-4" />
            </button>
            <button onClick={() => onDownload(photo.image_url, index)} className="p-2 rounded-lg bg-secondary text-foreground hover:bg-secondary/80">
              <Download className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-2 rounded-lg bg-secondary text-foreground hover:bg-secondary/80">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Image */}
        <div className="flex-1 flex items-center justify-center overflow-hidden px-12 relative" onClick={e => e.stopPropagation()}>
          <button onClick={prev} className="absolute left-2 z-10 p-3 rounded-full bg-secondary/80 text-foreground hover:bg-secondary">
            <ChevronLeft className="w-5 h-5" />
          </button>

          <motion.img
            key={photo.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            src={photo.image_url}
            alt=""
            className="max-h-[80vh] max-w-full object-contain rounded-lg"
            style={{ transform: `scale(${zoom})`, transition: "transform 0.2s" }}
          />

          <button onClick={next} className="absolute right-2 z-10 p-3 rounded-full bg-secondary/80 text-foreground hover:bg-secondary">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default PhotoLightbox;
