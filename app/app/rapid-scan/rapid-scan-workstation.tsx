"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import jsQR from "jsqr";

import { rapidScanTransitionAction } from "@/lib/devices/actions";
import { deviceTypeLabels, statusLabels } from "@/lib/devices/format";
import type {
  DeviceCustodyStatus,
  RapidScanDevice,
  RapidScanMode,
  RapidScanStudent,
  RapidScanTransitionResult
} from "@/lib/devices/types";
import { requiresSoftwareQrFallback } from "@/lib/qr/decode-strategy";

const modeStorageKey = "bdm-rapid-scan-mode";
const unavailableMessage = "No matching student is available in your access scope.";
const decodeIntervalMs = 250;
const maximumDecodeDimension = 960;

function normalize(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function devicePassLookup(value: string) {
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    const parts = url.pathname.split("/").filter(Boolean);
    const passIndex = parts.indexOf("device-pass");
    return passIndex >= 0 && parts[passIndex + 1] ? parts[passIndex + 1] : trimmed;
  } catch {
    return trimmed;
  }
}

type DetectedBarcode = {
  rawValue: string;
};

type BarcodeDetectorLike = {
  detect(video: HTMLVideoElement): Promise<DetectedBarcode[]>;
};

type BarcodeDetectorConstructor = {
  new (options: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
};

type ScannedDeviceMatch = {
  student: RapidScanStudent;
  device: RapidScanDevice;
};

function resolveScannedDevice(
  students: RapidScanStudent[],
  rawValue: string
): ScannedDeviceMatch | null {
  const query = normalize(devicePassLookup(rawValue));
  if (!query) return null;

  const matches: ScannedDeviceMatch[] = [];
  for (const student of students) {
    for (const device of student.devices) {
      const identifiers = [
        device.id,
        device.qrToken,
        device.assetTag ?? "",
        device.serialNumber ?? ""
      ].map(normalize);

      if (identifiers.some((identifier) => identifier === query)) {
        matches.push({ student, device });
      }
    }
  }

  return matches.length === 1 ? matches[0] : null;
}

export function rapidScanStudentMatches(student: RapidScanStudent, rawQuery: string) {
  const query = normalize(devicePassLookup(rawQuery));
  if (!query) return true;

  const studentFields = [
    student.firstName,
    student.lastName,
    `${student.firstName} ${student.lastName}`,
    `${student.lastName} ${student.firstName}`,
    student.studentNumber ?? ""
  ].map(normalize);

  if (studentFields.some((field) => field.includes(query))) return true;

  return student.devices.some((device) =>
    [device.id, device.qrToken, device.assetTag ?? "", device.serialNumber ?? ""]
      .map(normalize)
      .some((field) => field === query)
  );
}

function eligibleStatus(mode: RapidScanMode | null): DeviceCustodyStatus | null {
  if (mode === "release") return "returned";
  if (mode === "return") return "checked_out";
  return null;
}

function studentName(student: RapidScanStudent) {
  return `${student.lastName}, ${student.firstName}`;
}

export default function RapidScanWorkstation({
  initialStudents
}: {
  initialStudents: RapidScanStudent[];
}) {
  const [students, setStudents] = useState(initialStudents);
  const [mode, setMode] = useState<RapidScanMode | null>(null);
  const [query, setQuery] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [residenceFilter, setResidenceFilter] = useState("all");
  const [pendingDeviceId, setPendingDeviceId] = useState<string | null>(null);
  const [scannedDeviceId, setScannedDeviceId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<RapidScanTransitionResult | null>(null);
  const [searchMessage, setSearchMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastScanRef = useRef("");
  const residenceStudentsRef = useRef<RapidScanStudent[]>([]);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    const storedMode = window.sessionStorage.getItem(modeStorageKey);
    if (storedMode === "release" || storedMode === "return") setMode(storedMode);
  }, []);

  const residences = useMemo(() => {
    const byId = new Map<string, string>();
    for (const student of students) {
      if (student.residenceId && student.residenceLabel) {
        byId.set(student.residenceId, student.residenceLabel);
      }
    }
    return Array.from(byId, ([id, label]) => ({ id, label })).sort((a, b) =>
      a.label.localeCompare(b.label)
    );
  }, [students]);

  const residenceStudents = useMemo(
    () =>
      residenceFilter === "all"
        ? students
        : students.filter((student) => student.residenceId === residenceFilter),
    [residenceFilter, students]
  );

  useEffect(() => {
    residenceStudentsRef.current = residenceStudents;
  }, [residenceStudents]);

  useEffect(() => {
    if (!scanning) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      return;
    }

    let cancelled = false;
    let animationFrame = 0;
    let decodeInFlight = false;
    let lastDecodeAt = 0;
    let canvas: HTMLCanvasElement | null = null;

    async function startCamera() {
      try {
        const Detector = (window as unknown as {
          BarcodeDetector?: BarcodeDetectorConstructor;
        }).BarcodeDetector;

        let nativeQrSupported: boolean | null = null;
        if (Detector?.getSupportedFormats) {
          try {
            nativeQrSupported = (await Detector.getSupportedFormats()).includes("qr_code");
          } catch {
            nativeQrSupported = null;
          }
        }

        let useSoftwareFallback = requiresSoftwareQrFallback({
          nativeAvailable: Boolean(Detector),
          nativeQrSupported,
          consecutiveNativeEmptyResults: 0
        });

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        let detector: BarcodeDetectorLike | null = null;
        if (!useSoftwareFallback && Detector) {
          try {
            detector = new Detector({ formats: ["qr_code"] });
          } catch {
            useSoftwareFallback = true;
          }
        }

        let consecutiveNativeEmptyResults = 0;

        function handleDecodedValue(rawValue: string) {
          const parsedValue = devicePassLookup(rawValue);
          if (!parsedValue || normalize(parsedValue) === normalize(lastScanRef.current)) return;

          lastScanRef.current = parsedValue;
          const match = resolveScannedDevice(residenceStudentsRef.current, parsedValue);

          if (match) {
            setSelectedStudentId(match.student.id);
            setQuery(studentName(match.student));
            setScannedDeviceId(match.device.id);
            setSearchMessage("Scanned device found. Choose an explicit device action below.");
            setFeedback(null);
          } else {
            setSelectedStudentId(null);
            setScannedDeviceId(null);
            setQuery("");
            setSearchMessage(unavailableMessage);
          }
        }

        const scan = async (timestamp: number) => {
          const video = videoRef.current;
          if (cancelled || !video) return;

          const frameReady =
            video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
            video.videoWidth > 0 &&
            video.videoHeight > 0;

          if (
            !frameReady ||
            decodeInFlight ||
            timestamp - lastDecodeAt < decodeIntervalMs
          ) {
            animationFrame = window.requestAnimationFrame(scan);
            return;
          }

          lastDecodeAt = timestamp;
          decodeInFlight = true;

          try {
            let decodedValue = "";

            if (useSoftwareFallback) {
              canvas ??= document.createElement("canvas");
              const scale = Math.min(1, maximumDecodeDimension / Math.max(video.videoWidth, video.videoHeight));
              const width = Math.max(1, Math.round(video.videoWidth * scale));
              const height = Math.max(1, Math.round(video.videoHeight * scale));
              if (canvas.width !== width) canvas.width = width;
              if (canvas.height !== height) canvas.height = height;

              const context = canvas.getContext("2d", { willReadFrequently: true });
              if (!context) throw new Error("Camera frame decoding is unavailable.");
              context.drawImage(video, 0, 0, width, height);
              const imageData = context.getImageData(0, 0, width, height);
              decodedValue = jsQR(imageData.data, width, height, {
                inversionAttempts: "dontInvert"
              })?.data ?? "";
            } else if (detector) {
              try {
                const barcodes = await detector.detect(video);
                decodedValue = barcodes[0]?.rawValue ?? "";
                if (decodedValue) {
                  consecutiveNativeEmptyResults = 0;
                } else {
                  consecutiveNativeEmptyResults += 1;
                  useSoftwareFallback = requiresSoftwareQrFallback({
                    nativeAvailable: true,
                    nativeQrSupported,
                    consecutiveNativeEmptyResults
                  });
                }
              } catch {
                useSoftwareFallback = true;
              }
            }

            if (!cancelled && decodedValue) handleDecodedValue(decodedValue);
          } catch (error) {
            if (!cancelled) {
              setCameraError(error instanceof Error ? error.message : "Camera scanning could not continue. Use manual search.");
              setScanning(false);
            }
            return;
          } finally {
            decodeInFlight = false;
          }

          if (!cancelled) animationFrame = window.requestAnimationFrame(scan);
        };

        animationFrame = window.requestAnimationFrame(scan);
      } catch (error) {
        if (!cancelled) {
          setCameraError(error instanceof Error ? error.message : "Camera could not be opened. Use manual search.");
          setScanning(false);
        }
      }
    }

    void startCamera();

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      canvas = null;
    };
  }, [scanning]);

  const matches = useMemo(
    () =>
      deferredQuery.trim()
        ? residenceStudents.filter((student) => rapidScanStudentMatches(student, deferredQuery))
        : [],
    [deferredQuery, residenceStudents]
  );
  const selectedStudent = students.find((student) => student.id === selectedStudentId) ?? null;
  const requiredStatus = eligibleStatus(mode);
  const remainingEligible = selectedStudent
    ? selectedStudent.devices.filter((device) => device.status === requiredStatus).length
    : 0;

  function chooseMode(nextMode: RapidScanMode) {
    setMode(nextMode);
    window.sessionStorage.setItem(modeStorageKey, nextMode);
    setFeedback(null);
  }

  function selectStudent(student: RapidScanStudent) {
    setSelectedStudentId(student.id);
    setQuery(studentName(student));
    setScannedDeviceId(null);
    setSearchMessage("");
    setFeedback(null);
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (matches.length === 1) {
      selectStudent(matches[0]);
      return;
    }
    setSearchMessage(matches.length === 0 ? unavailableMessage : "Select the matching student below.");
  }

  function nextStudent() {
    setSelectedStudentId(null);
    setQuery("");
    setFeedback(null);
    setSearchMessage("");
    setScannedDeviceId(null);
    lastScanRef.current = "";
    window.requestAnimationFrame(() => searchRef.current?.focus());
  }

  function runTransition(deviceId: string) {
    if (!mode || isPending || pendingDeviceId) return;
    setPendingDeviceId(deviceId);
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await rapidScanTransitionAction({ deviceId, operation: mode });
        if ((result.status === "applied" || result.status === "stale_status") && result.currentStatus) {
          setStudents((current) =>
            current.map((student) => ({
              ...student,
              devices: student.devices.map((device) =>
                device.id === result.deviceId ? { ...device, status: result.currentStatus! } : device
              )
            }))
          );
        }
        setFeedback(result);
      } catch {
        setFeedback({
          status: "unavailable",
          message: unavailableMessage,
          deviceId,
          previousStatus: null,
          currentStatus: null
        });
      } finally {
        setPendingDeviceId(null);
      }
    });
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
        <fieldset>
          <legend className="text-base font-semibold text-neutral-950">1. Select operating mode</legend>
          <p className="mt-1 text-sm text-neutral-600">Choose explicitly before processing a device.</p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {([
              ["release", "Morning Release", "Release devices currently in school storage."],
              ["return", "Evening Return", "Return devices currently with students."]
            ] as const).map(([value, label, description]) => (
              <button
                aria-pressed={mode === value}
                className={`min-h-14 rounded-md border px-4 py-3 text-left ${
                  mode === value
                    ? "border-brand bg-brand-soft text-brand-dark"
                    : "border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50"
                }`}
                key={value}
                onClick={() => chooseMode(value)}
                type="button"
              >
                <span className="block font-semibold">{label}</span>
                <span className="mt-1 block text-sm">{description}</span>
              </button>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-base font-semibold text-neutral-950">2. Find student</h2>
        {residences.length > 1 ? (
          <label className="mt-3 block text-sm font-medium text-neutral-700">
            Residence filter
            <select
              className="mt-1 min-h-12 w-full rounded-md border border-neutral-300 bg-white px-3"
              onChange={(event) => {
                setResidenceFilter(event.target.value);
                setSelectedStudentId(null);
                setScannedDeviceId(null);
                lastScanRef.current = "";
              }}
              value={residenceFilter}
            >
              <option value="all">All accessible residences</option>
              {residences.map((residence) => (
                <option key={residence.id} value={residence.id}>{residence.label}</option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="mt-3 rounded-md border border-neutral-200 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-neutral-900">Camera QR fallback</p>
              <p className="mt-1 text-sm text-neutral-600">
                Scanning identifies a device and student only. It does not change custody.
              </p>
            </div>
            <button
              className="min-h-12 rounded-md border border-neutral-300 px-4 font-semibold text-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400"
              disabled={!mode}
              onClick={() => {
                if (!mode) return;
                setCameraError(null);
                if (!scanning) lastScanRef.current = "";
                setScanning((current) => !current);
              }}
              type="button"
            >
              {scanning ? "Stop Scan" : "Start Scan"}
            </button>
          </div>
          {!mode ? (
            <p className="mt-3 text-sm font-semibold text-amber-900" role="status">
              Select Morning Release or Evening Return before starting the camera.
            </p>
          ) : null}
          {cameraError ? <p className="mt-3 text-sm font-semibold text-brand" role="status">{cameraError}</p> : null}
          {scanning ? (
            <video
              className="mt-3 aspect-video w-full rounded-md bg-neutral-950 object-cover"
              muted
              playsInline
              ref={videoRef}
            />
          ) : null}
        </div>
        <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={submitSearch}>
          <label className="flex-1 text-sm font-medium text-neutral-700">
            Student or device identifier
            <input
              autoComplete="off"
              autoFocus
              className="mt-1 min-h-12 w-full rounded-md border border-neutral-300 px-3 text-base"
              onChange={(event) => {
                setQuery(event.target.value);
                setSearchMessage("");
                setScannedDeviceId(null);
              }}
              placeholder="Name, student number, asset tag, serial, or QR token"
              ref={searchRef}
              value={query}
            />
          </label>
          <button className="min-h-12 rounded-md bg-brand px-5 font-semibold text-white sm:self-end" type="submit">
            Find student
          </button>
        </form>
        {searchMessage ? <p className="mt-3 text-sm font-semibold text-brand" role="status">{searchMessage}</p> : null}
        {!selectedStudent && matches.length > 0 ? (
          <div className="mt-3 grid gap-2">
            {matches.slice(0, 8).map((student) => (
              <button
                className="min-h-12 rounded-md border border-neutral-300 px-4 py-3 text-left hover:bg-neutral-50"
                key={student.id}
                onClick={() => selectStudent(student)}
                type="button"
              >
                <span className="block font-semibold text-neutral-950">{studentName(student)}</span>
                <span className="block text-sm text-neutral-600">
                  {student.studentNumber ?? "No student number"} / {student.residenceLabel ?? "No residence"}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {selectedStudent ? (
        <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <p className="text-sm font-medium text-brand">3. Student context</p>
              <h2 className="mt-1 text-2xl font-semibold text-neutral-950">{studentName(selectedStudent)}</h2>
              <p className="mt-1 text-sm text-neutral-600">
                {selectedStudent.studentNumber ?? "No student number"} / {selectedStudent.residenceLabel ?? "No residence"}
              </p>
            </div>
            <button className="min-h-12 rounded-md border border-neutral-300 px-4 font-semibold text-neutral-700" onClick={nextStudent} type="button">
              Next Student
            </button>
          </div>

          {!mode ? (
            <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900" role="status">
              Select Morning Release or Evening Return before processing a device.
            </p>
          ) : null}
          {feedback ? (
            <p
              className={`mt-4 rounded-md border p-3 text-sm font-semibold ${
                feedback.status === "applied"
                  ? "border-green-300 bg-green-50 text-green-900"
                  : "border-amber-300 bg-amber-50 text-amber-900"
              }`}
              role="status"
            >
              {feedback.message}
            </p>
          ) : null}
          {mode && remainingEligible === 0 ? (
            <p className="mt-4 rounded-md border border-green-300 bg-green-50 p-3 text-sm font-semibold text-green-900" role="status">
              This student has no remaining devices eligible for {mode === "release" ? "Morning Release" : "Evening Return"}. Choose Next Student when ready.
            </p>
          ) : null}

          <div className="mt-4 grid gap-3">
            {selectedStudent.devices.map((device) => {
              const eligible = Boolean(mode && device.status === requiredStatus);
              const pending = pendingDeviceId === device.id;
              return (
                <article
                  className={`rounded-md border p-4 ${
                    scannedDeviceId === device.id ? "border-brand bg-brand-soft" : "border-neutral-200"
                  }`}
                  key={device.id}
                >
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <div>
                      <h3 className="font-semibold text-neutral-950">{device.manufacturer} {device.model}</h3>
                      <p className="mt-1 text-sm text-neutral-600">
                        {deviceTypeLabels[device.deviceType]} / {device.assetTag ?? device.serialNumber ?? "No asset or serial"}
                      </p>
                      <p className="mt-2 text-sm font-semibold text-neutral-800">Status: {statusLabels[device.status]}</p>
                      {scannedDeviceId === device.id ? (
                        <p className="mt-2 text-sm font-semibold text-brand">Scanned device — custody unchanged</p>
                      ) : null}
                    </div>
                    {eligible ? (
                      <button
                        className="min-h-12 min-w-40 rounded-md bg-brand px-5 font-semibold text-white disabled:cursor-not-allowed disabled:bg-neutral-400"
                        disabled={isPending || pendingDeviceId !== null}
                        onClick={() => runTransition(device.id)}
                        type="button"
                      >
                        {pending ? "Processing..." : mode === "release" ? "Release device" : "Return device"}
                      </button>
                    ) : (
                      <span className="rounded-md bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-600">
                        {mode ? "Not eligible in this mode" : "Select a mode"}
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
            {selectedStudent.devices.length === 0 ? (
              <p className="rounded-md bg-neutral-100 p-4 text-sm text-neutral-700">No registered devices are available for this student.</p>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
