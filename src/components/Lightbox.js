"use client";

import { useEffect, useState } from "react";
import { useGraphStore } from "@/store/graphStore";
import { getImage } from "@/lib/dexieStore";

const Lightbox = () => {
  const {
    lightboxNodeId,
    closeLightbox,
    getNodeImage,
  } = useGraphStore();

  const [src, setSrc] = useState(null);

  // Load image when opening
  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!lightboxNodeId) {
        setSrc(null);
        return;
      }
      const inMemory = getNodeImage(lightboxNodeId);
      if (inMemory) {
        if (active) setSrc(inMemory);
        return;
      }
      // Fallback to Dexie
      const persisted = await getImage(lightboxNodeId);
      if (active) setSrc(persisted || null);
    };
    load();
    return () => { active = false; };
  }, [lightboxNodeId, getNodeImage]);

  // Close on Escape
  useEffect(() => {
    if (!lightboxNodeId) return;
    const onKey = (e) => {
      if (e.key === "Escape") closeLightbox();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxNodeId, closeLightbox]);

  if (!lightboxNodeId) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-[1px] flex items-center justify-center p-6"
      onClick={closeLightbox}
    >
      <div
        className="relative max-w-[95vw] max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {src ? (
          <img
            src={src}
            alt="Preview"
            className="max-w-[95vw] max-h-[90vh] rounded-lg shadow-2xl"
          />
        ) : (
          <div className="w-[60vw] h-[60vh] rounded-lg bg-neutral-900/60 border border-neutral-800 flex items-center justify-center text-neutral-400">
            Loading...
          </div>
        )}

        <button
          onClick={closeLightbox}
          className="absolute -top-3 -right-3 bg-white text-black rounded-full w-8 h-8 flex items-center justify-center shadow-lg"
          title="Close"
        >
          ×
        </button>
      </div>
    </div>
  );
};

export default Lightbox;

