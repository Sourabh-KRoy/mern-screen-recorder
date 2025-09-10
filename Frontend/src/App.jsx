import React, { useEffect, useRef, useState } from "react";
import { apiBaseUrl } from "./apiurl";

export default function App() {
  const [recording, setRecording] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [blobObject, setBlobObject] = useState(null);
  const [timer, setTimer] = useState(0);
  const [message, setMessage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [recordings, setRecordings] = useState([]);
  const [loadingRecordings, setLoadingRecordings] = useState(false);

  const [activeTab, setActiveTab] = useState("record");
  const [page, setPage] = useState(1);
  const pageSize = 3;

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const combinedStreamRef = useRef(null);
  const intervalRef = useRef(null);

  const MAX_SECONDS = 180;

  useEffect(() => {
    fetchRecordings();
    return () => cleanupStreams();
  }, []);

  function cleanupStreams() {
    try {
      const s = combinedStreamRef.current;
      if (s) s.getTracks().forEach((t) => t.stop());
    } catch (e) {}
    combinedStreamRef.current = null;
  }

  async function startRecording() {
    setMessage(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      setMessage(
        "getDisplayMedia not supported in this browser. Use recent Chrome."
      );
      return;
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      let micStream = null;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {}

      const combined = new MediaStream();
      screenStream
        .getVideoTracks()
        .forEach((track) => combined.addTrack(track));
      screenStream
        .getAudioTracks()
        .forEach((track) => combined.addTrack(track));
      if (micStream)
        micStream.getAudioTracks().forEach((track) => combined.addTrack(track));

      combinedStreamRef.current = combined;

      let options = {};
      if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9"))
        options = { mimeType: "video/webm;codecs=vp9" };
      else if (MediaRecorder.isTypeSupported("video/webm;codecs=vp8"))
        options = { mimeType: "video/webm;codecs=vp8" };
      else if (MediaRecorder.isTypeSupported("video/webm"))
        options = { mimeType: "video/webm" };

      chunksRef.current = [];
      const mr = new MediaRecorder(combined, options);

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: chunksRef.current[0]?.type || "video/webm",
        });
        setBlobObject(blob);
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        cleanupStreams();
        setRecording(false);
        clearInterval(intervalRef.current);
        setTimer(0);
      };

      mr.start(1000);
      mediaRecorderRef.current = mr;
      setRecording(true);
      setTimer(0);

      intervalRef.current = setInterval(() => {
        setTimer((prev) => {
          const next = prev + 1;
          if (next >= MAX_SECONDS) stopRecording();
          return next;
        });
      }, 1000);
    } catch (err) {
      setMessage("Could not start recording: " + (err.message || err));
    }
  }

  function stopRecording() {
    try {
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.stop();
      }
    } catch {}

    try {
      const s = combinedStreamRef.current;
      if (s) s.getTracks().forEach((t) => t.stop());
    } catch {}

    clearInterval(intervalRef.current);
  }

  function formatTime(sec) {
    const mm = Math.floor(sec / 60)
      .toString()
      .padStart(2, "0");
    const ss = (sec % 60).toString().padStart(2, "0");
    return `${mm}:${ss}`;
  }

  function downloadRecording() {
    if (!blobObject) return;
    const a = document.createElement("a");
    const url = URL.createObjectURL(blobObject);
    const filename = `recording-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.webm`;
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function uploadRecording() {
    if (!blobObject) {
      setMessage("No recording to upload.");
      return;
    }
    setUploading(true);
    setMessage(null);

    const filename = `recording-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.webm`;
    const form = new FormData();
    form.append("file", blobObject, filename);

    try {
      const res = await fetch(`${apiBaseUrl}/api/recordings`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      if (result) {
        setMessage("Upload successful");
        alert("File uploaded successfully.");
        await fetchRecordings();
        setPreviewUrl(null);
        setBlobObject(null);
        setMessage(null);
      } else {
        alert("File upload failed.");
      }
    } catch (err) {
      setMessage("Upload failed: " + (err.message || err));
    } finally {
      setUploading(false);
    }
  }

  async function fetchRecordings() {
    setLoadingRecordings(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/recordings`);
      if (!res.ok) return;
      const arr = await res.json();
      setRecordings(Array.isArray(arr) ? arr : []);
    } catch {
    } finally {
      setLoadingRecordings(false);
    }
  }

  function humanSize(bytes) {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    let b = bytes;
    while (b >= 1024 && i < units.length - 1) {
      b /= 1024;
      i++;
    }
    return `${b.toFixed(1)} ${units[i]}`;
  }

  const paginatedRecordings = recordings.slice(
    (page - 1) * pageSize,
    page * pageSize
  );
  const totalPages = Math.ceil(recordings.length / pageSize);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow p-6">
        <h1 className="text-2xl font-semibold mb-4">Screen Recorder</h1>

        {/* Tabs */}
        <div className="flex gap-4 mb-6 border-b">
          <button
            onClick={() => setActiveTab("record")}
            className={`px-4 py-2 ${
              activeTab === "record"
                ? "border-b-2 border-blue-600 font-semibold"
                : ""
            }`}
          >
            Record
          </button>
          <button
            onClick={() => setActiveTab("videos")}
            className={`px-4 py-2 ${
              activeTab === "videos"
                ? "border-b-2 border-blue-600 font-semibold"
                : ""
            }`}
          >
            Uploaded Videos
          </button>
        </div>

        {activeTab === "record" && (
          <>
            <div className="flex gap-3 items-center mb-4">
              {!recording ? (
                <button
                  onClick={startRecording}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  Start
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Stop
                </button>
              )}

              <div className="ml-4 text-sm text-gray-700">
                Timer:{" "}
                <span className="font-mono ml-2">{formatTime(timer)}</span>
              </div>
              <div className="ml-auto text-sm text-gray-600">Limit: 3:00</div>
            </div>

            {message && (
              <div className="mb-4 p-3 rounded bg-yellow-50 text-yellow-800">
                {message}
              </div>
            )}

            <div className="space-y-4">
              {previewUrl ? (
                <div>
                  <h2 className="text-lg font-medium mb-2">Preview</h2>
                  <video className="w-full rounded" src={previewUrl} controls />
                  <div className="mt-3 flex gap-3">
                    <button
                      onClick={downloadRecording}
                      className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                    >
                      Download
                    </button>
                    <button
                      onClick={uploadRecording}
                      disabled={uploading}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      {uploading ? "Uploading..." : "Upload to Server"}
                    </button>
                    <button
                      onClick={() => {
                        setPreviewUrl(null);
                        setBlobObject(null);
                        setMessage(null);
                      }}
                      className="px-4 py-2 bg-gray-200 rounded"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-500">
                  No preview yet. Start a recording to see a preview here.
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === "videos" && (
          <>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-medium">Uploaded Recordings</h2>
              <button
                onClick={fetchRecordings}
                className="px-3 py-1 bg-gray-100 rounded"
              >
                Refresh
              </button>
            </div>

            {loadingRecordings ? (
              <div className="flex justify-center items-center py-6">
                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="ml-2 text-sm text-gray-600"></span>
              </div>
            ) : recordings.length === 0 ? (
              <div className="text-sm text-gray-500">
                No recordings uploaded yet.
              </div>
            ) : (
              <div className="space-y-3">
                {paginatedRecordings.map((r, idx) => (
                  <div key={idx} className="border rounded p-3 bg-gray-50">
                    <div className="font-medium">
                      {r.title ||
                        `Recording ${(page - 1) * pageSize + idx + 1}`}
                    </div>
                    <div className="text-xs text-gray-500">
                      {humanSize(r.size)} •{" "}
                      {new Date(r.createdAt).toLocaleString()}
                    </div>
                    <video
                      className="w-full rounded mt-2"
                      src={`${apiBaseUrl}${r.url}`}
                      controls
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center mt-4 gap-2">
                <button
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
                >
                  Prev
                </button>
                <span className="px-3 py-1">
                  {page} / {totalPages}
                </span>
                <button
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
