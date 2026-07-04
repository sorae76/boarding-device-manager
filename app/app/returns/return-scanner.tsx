"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";

import { scanReturnDeviceAction, type ReturnScanState } from "@/lib/devices/actions";
import { formatDateTime } from "@/lib/devices/format";

const initialState: ReturnScanState = {
  status: "idle",
  message: "Ready to scan."
};

type DetectedBarcode = {
  rawValue: string;
};

type BarcodeDetectorLike = {
  detect(video: HTMLVideoElement): Promise<DetectedBarcode[]>;
};

function extractLookup(value: string) {
  const trimmed = value.trim();

  try {
    const url = new URL(trimmed);
    const parts = url.pathname.split("/").filter(Boolean);
    const passIndex = parts.indexOf("device-pass");

    if (passIndex >= 0 && parts[passIndex + 1]) {
      return parts[passIndex + 1];
    }
  } catch {
    // Plain QR tokens are expected too.
  }

  return trimmed;
}

function SubmitButton({ confirmDuplicate }: { confirmDuplicate: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-neutral-400"
      disabled={pending}
      type="submit"
    >
      {pending ? "Recording..." : confirmDuplicate ? "Record duplicate return" : "Record return"}
    </button>
  );
}

export default function ReturnScanner({ initialLookup }: { initialLookup?: string }) {
  const [state, formAction] = useFormState(scanReturnDeviceAction, initialState);
  const [lookup, setLookup] = useState(initialLookup ?? "");
  const [method, setMethod] = useState<"qr_scan" | "manual">(initialLookup ? "manual" : "qr_scan");
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastScanRef = useRef("");

  useEffect(() => {
    if (state.status === "success") {
      setLookup("");
      setConfirmDuplicate(false);
      lastScanRef.current = "";
    }

    if (state.status === "already_returned") {
      setConfirmDuplicate(true);
    }
  }, [state]);

  useEffect(() => {
    if (!scanning) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      return;
    }

    let cancelled = false;
    let animationFrame = 0;

    async function startCamera() {
      try {
        const Detector = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => BarcodeDetectorLike }).BarcodeDetector;

        if (!Detector) {
          setCameraError("This browser does not support camera QR scanning. Use manual entry.");
          setScanning(false);
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false
        });
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const detector = new Detector({ formats: ["qr_code"] });
        const scan = async () => {
          if (cancelled || !videoRef.current) {
            return;
          }

          const barcodes = await detector.detect(videoRef.current);
          const rawValue = barcodes[0]?.rawValue;

          if (rawValue) {
            const nextLookup = extractLookup(rawValue);
            if (nextLookup && nextLookup !== lastScanRef.current) {
              lastScanRef.current = nextLookup;
              setLookup(nextLookup);
              setMethod("qr_scan");
              setConfirmDuplicate(false);
              window.setTimeout(() => formRef.current?.requestSubmit(), 50);
            }
          }

          animationFrame = window.requestAnimationFrame(scan);
        };

        animationFrame = window.requestAnimationFrame(scan);
      } catch (error) {
        setCameraError(error instanceof Error ? error.message : "Camera could not be opened.");
        setScanning(false);
      }
    }

    void startCamera();

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [scanning]);

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-neutral-950">Camera scanner</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Scan the student device pass QR. This records app QR scans only.
            </p>
          </div>
          <button
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-100"
            onClick={() => {
              setCameraError(null);
              setScanning((current) => !current);
            }}
            type="button"
          >
            {scanning ? "Stop scan" : "Start scan"}
          </button>
        </div>

        {cameraError ? <p className="mt-3 text-sm font-medium text-brand">{cameraError}</p> : null}

        {scanning ? (
          <video
            className="mt-4 aspect-video w-full rounded-md bg-neutral-950 object-cover"
            muted
            playsInline
            ref={videoRef}
          />
        ) : null}
      </div>

      <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <form action={formAction} className="space-y-5" ref={formRef}>
          <input name="confirmDuplicate" type="hidden" value={confirmDuplicate ? "yes" : "no"} />
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="font-medium text-neutral-700">
                QR token, device ID, asset tag, or serial number
              </span>
              <input
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                name="lookup"
                onChange={(event) => {
                  setLookup(event.target.value);
                  setConfirmDuplicate(false);
                  setMethod("manual");
                }}
                required
                value={lookup}
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-medium text-neutral-700">Method</span>
              <select
                className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
                name="method"
                onChange={(event) => setMethod(event.target.value as "qr_scan" | "manual")}
                value={method}
              >
                <option value="qr_scan">QR scan</option>
                <option value="manual">Manual</option>
              </select>
            </label>

            <label className="space-y-1 text-sm md:col-span-2">
              <span className="font-medium text-neutral-700">Notes</span>
              <textarea
                className="min-h-24 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                name="notes"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <p
                className={
                  state.status === "success"
                    ? "font-semibold text-green-700"
                    : state.status === "already_returned" || state.status === "error"
                      ? "font-semibold text-brand"
                      : "font-medium text-neutral-700"
                }
              >
                {state.message}
              </p>
              {state.deviceLabel ? (
                <p className="mt-1 text-neutral-600">
                  {state.deviceLabel} / {state.studentName}
                </p>
              ) : null}
              {state.latestReturnAt ? (
                <p className="mt-1 text-neutral-500">
                  Latest return: {formatDateTime(state.latestReturnAt)}
                </p>
              ) : null}
            </div>
            <SubmitButton confirmDuplicate={confirmDuplicate} />
          </div>
        </form>
      </section>
    </div>
  );
}
