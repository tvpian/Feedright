"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

interface Props {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

export function BarcodeScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onScanRef = useRef(onScan);
  const [error, setError]   = useState("");
  const [status, setStatus] = useState("Starting camera…");

  // Keep the ref current so the decode callback always calls the latest onScan
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  useEffect(() => {
    let codeReader: any;
    let stopped = false;

    async function start() {
      // navigator.mediaDevices is only available in secure contexts (HTTPS / localhost)
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(
          location.protocol === "https:" || location.hostname === "localhost"
            ? "Camera access is not available on this device."
            : "Camera requires HTTPS. Access the app via https:// or on localhost.",
        );
        return;
      }
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        codeReader = new BrowserMultiFormatReader();

        // decodeFromConstraints requests camera permission automatically and
        // works in both HTTP (localhost) and HTTPS contexts.
        await codeReader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          videoRef.current!,
          (result: any, err: any) => {
            if (stopped) return;
            if (result) {
              stopped = true;
              onScanRef.current(result.getText());
              try { codeReader.reset(); } catch {}
            }
            // err fires every frame when no code is found — ignore it
          }
        );
        setStatus("Point camera at a barcode…");
      } catch (e: any) {
        const msg = e?.message ?? String(e);
        if (/permission|denied|not allowed/i.test(msg)) {
          setError("Camera permission denied. Allow camera access and try again.");
        } else if (/video input/i.test(msg) || /no.*device/i.test(msg)) {
          setError("No camera found on this device.");
        } else {
          setError("Could not start camera: " + msg);
        }
      }
    }

    start();
    return () => {
      stopped = true;
      try { codeReader?.reset(); } catch {}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80">
        <p className="text-white text-sm font-medium">{status}</p>
        <button onClick={onClose} className="p-2 text-white hover:text-gray-300">
          <X size={22} />
        </button>
      </div>

      {/* Viewfinder */}
      <div className="flex-1 relative">
        <video ref={videoRef} className="w-full h-full object-cover" muted playsInline autoPlay />
        {/* Targeting frame */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-64 h-36 border-2 border-white/70 rounded-xl relative">
            {/* Corner accents */}
            {[["top-0 left-0","rounded-tl-lg"], ["top-0 right-0","rounded-tr-lg"], ["bottom-0 left-0","rounded-bl-lg"], ["bottom-0 right-0","rounded-br-lg"]].map(([pos, round], i) => (
              <div key={i} className={`absolute w-6 h-6 border-[3px] border-brand-400 ${pos} ${round}`} />
            ))}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 bg-red-900/80 text-red-200 text-sm text-center">
          {error}
        </div>
      )}
    </div>
  );
}
