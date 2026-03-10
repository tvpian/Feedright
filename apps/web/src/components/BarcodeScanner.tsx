"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

interface Props {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

export function BarcodeScanner({ onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError]   = useState("");
  const [status, setStatus] = useState("Starting camera…");

  useEffect(() => {
    let codeReader: any;
    let stopped = false;

    async function start() {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        codeReader = new BrowserMultiFormatReader();

        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        if (!devices.length) { setError("No camera found on this device."); return; }

        // Prefer back camera on mobile
        const back = devices.find((d) =>
          /back|rear|environment/i.test(d.label)
        ) ?? devices[devices.length - 1];

        setStatus("Point camera at a barcode…");

        await codeReader.decodeFromVideoDevice(
          back.deviceId,
          videoRef.current!,
          (result: any, err: any) => {
            if (stopped) return;
            if (result) {
              stopped = true;
              codeReader.reset();
              onScan(result.getText());
            }
          }
        );
      } catch (e: any) {
        setError(e?.message?.includes("Permission")
          ? "Camera permission denied. Allow camera access and try again."
          : "Could not start camera: " + (e?.message ?? String(e)));
      }
    }

    start();
    return () => {
      stopped = true;
      try { codeReader?.reset(); } catch {}
    };
  }, [onScan]);

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
