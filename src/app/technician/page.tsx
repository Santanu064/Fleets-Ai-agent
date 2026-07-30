"use client";

import { useState } from "react";
import Link from "next/link";
import type { Issue, Message } from "@/lib/types";

export default function TechnicianPortal() {
  const [searchId, setSearchId] = useState("");
  const [loading, setLoading] = useState(false);
  const [issue, setIssue] = useState<Issue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replyInput, setReplyInput] = useState("");
  const [sending, setSending] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  async function handleSearch(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!searchId.trim()) return;

    setLoading(true);
    setError(null);
    setIssue(null);

    try {
      const res = await fetch(`/api/issues/${encodeURIComponent(searchId.trim())}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Issue ID not found");
      } else {
        setIssue(data);
      }
    } catch (err) {
      setError("Failed to connect to server");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateStatus(newStatus: "open" | "in_progress" | "resolved") {
    if (!issue) return;
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/issues/${issue.issue_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const updated = await res.json();
      if (res.ok) {
        setIssue((prev) => (prev ? { ...prev, status: updated.status } : null));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function handleSendReply() {
    if (!issue || !replyInput.trim() || sending) return;
    setSending(true);
    try {
      await fetch(`/api/conversations/${issue.conversation_id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: `[Technician Update]: ${replyInput.trim()}` }),
      });
      setReplyInput("");
      // Refresh issue history
      handleSearch();
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  }

  function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="min-h-screen bg-[#0d1117] text-white font-sans flex flex-col">
      {/* Header */}
      <header className="border-b border-white/10 bg-[#161b22] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center font-bold">
            🛠️
          </div>
          <div>
            <h1 className="text-base font-semibold text-white">Technician Diagnostics Portal</h1>
            <p className="text-xs text-white/40">Fleet Maintenance & Issue Resolution</p>
          </div>
        </div>
        <Link
          href="/"
          className="text-xs px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-white/70 transition-colors border border-white/10"
        >
          ← Back to Dispatch Dashboard
        </Link>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-6 space-y-6">
        {/* Search Bar Card */}
        <div className="bg-[#161b22] border border-white/10 rounded-xl p-6 shadow-xl">
          <form onSubmit={handleSearch} className="flex gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchId}
                onChange={(e) => setSearchId(e.target.value)}
                placeholder="Enter Issue ID (e.g. LG-2026-000245)..."
                className="w-full bg-[#0d1117] border border-white/15 rounded-lg px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !searchId.trim()}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-lg text-sm font-semibold transition-all flex items-center gap-2"
            >
              {loading ? (
                <span>Searching...</span>
              ) : (
                <>
                  <span>Lookup History</span>
                  <span>🔍</span>
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Tags */}
          <div className="mt-3 flex items-center gap-2 text-xs text-white/40">
            <span>Tip: Try searching any generated Issue ID like</span>
            <button
              type="button"
              onClick={() => {
                setSearchId("LG-2026-000245");
              }}
              className="underline text-indigo-400 hover:text-indigo-300 font-mono"
            >
              LG-2026-000245
            </button>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Issue Details View */}
        {issue && (
          <div className="space-y-6">
            {/* Ticket Summary Header */}
            <div className="bg-[#161b22] border border-white/10 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <span className="text-xl font-bold font-mono text-indigo-400">{issue.issue_id}</span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
                      issue.severity === "critical"
                        ? "bg-red-500/20 text-red-400 border border-red-500/30"
                        : issue.severity === "major"
                        ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                        : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    }`}
                  >
                    {issue.severity}
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
                      issue.status === "resolved"
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        : issue.status === "in_progress"
                        ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                        : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    }`}
                  >
                    {issue.status.replace("_", " ")}
                  </span>
                </div>
                <p className="text-xs text-white/50 mt-1">
                  Reported on {formatTime(issue.created_at)}
                </p>
              </div>

              {/* Status Actions */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/50 mr-1">Update Status:</span>
                <button
                  onClick={() => handleUpdateStatus("in_progress")}
                  disabled={updatingStatus || issue.status === "in_progress"}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600/30 disabled:opacity-40 transition-all"
                >
                  In Progress
                </button>
                <button
                  onClick={() => handleUpdateStatus("resolved")}
                  disabled={updatingStatus || issue.status === "resolved"}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 disabled:opacity-40 transition-all"
                >
                  Mark Resolved
                </button>
              </div>
            </div>

            {/* Grid layout: Driver/Vehicle Info & AI Diagnosis */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Driver & Vehicle Metadata Card */}
              <div className="bg-[#161b22] border border-white/10 rounded-xl p-5 space-y-4">
                <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider">
                  Driver & Vehicle Information
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-white/40">Driver Name:</span>
                    <span className="font-medium text-white">{issue.driver?.full_name || "Unknown"}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-white/40">Driver Phone:</span>
                    <span className="font-mono text-indigo-300">{issue.driver?.phone || "N/A"}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-white/40">Vehicle Plate:</span>
                    <span className="font-mono text-amber-300">{issue.vehicle?.plate_number || "Not Assigned"}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-white/40">Vehicle Model:</span>
                    <span className="text-white">{issue.vehicle?.make ? `${issue.vehicle.make} ${issue.vehicle.model}` : "Standard Fleet Unit"}</span>
                  </div>
                </div>
              </div>

              {/* AI Diagnostic Card */}
              <div className="bg-[#161b22] border border-white/10 rounded-xl p-5 space-y-4">
                <h3 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span>🤖</span> AI Diagnostic & Root Cause Analysis
                </h3>
                <div className="space-y-3 text-sm">
                  <div>
                    <span className="text-xs text-white/40 block">Assigned Department:</span>
                    <span className="font-semibold text-amber-300">{issue.department || "General Mechanics Team"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-white/40 block">Technician Notes & Manual Action:</span>
                    <p className="text-white/90 bg-indigo-500/10 border border-indigo-500/20 p-2.5 rounded-lg text-xs leading-relaxed mt-1">
                      {issue.suggested_solution || issue.ai_diagnosis || "Inspect vehicle wiring and sensor circuits."}
                    </p>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-white/40">Est. Repair Time:</span>
                    <span className="font-mono text-emerald-400 font-semibold">{issue.estimated_repair_time || "1 - 2 hours"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-white/40 block">AI Confidence Score:</span>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 bg-white/10 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-indigo-500 h-full rounded-full"
                          style={{ width: `${(issue.ai_confidence_score || 0.85) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-white/70">
                        {Math.round((issue.ai_confidence_score || 0.85) * 100)}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Conversation & Media History */}
            <div className="bg-[#161b22] border border-white/10 rounded-xl p-6 space-y-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <span>💬</span> Complete Message & Uploaded Media History
              </h3>

              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                {issue.messages && issue.messages.length > 0 ? (
                  issue.messages.map((msg: Message) => (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${
                        msg.role === "user" ? "items-start" : "items-end"
                      }`}
                    >
                      <div
                        className={`max-w-[80%] rounded-xl p-3.5 text-xs leading-relaxed ${
                          msg.role === "user"
                            ? "bg-white/10 text-white rounded-tl-none"
                            : "bg-indigo-600 text-white rounded-tr-none"
                        }`}
                      >
                        <div className="font-semibold text-[10px] text-white/50 mb-1">
                          {msg.role === "user" ? "Driver" : "AI Assistant / Technician"}
                        </div>

                        <p className="whitespace-pre-wrap">{msg.content}</p>

                        {/* Image Attachment Preview */}
                        {msg.media_type === "image" && msg.media_url && (
                          <div className="mt-2">
                            <a href={msg.media_url} target="_blank" rel="noopener noreferrer">
                              <img
                                src={msg.media_url}
                                alt="Driver uploaded issue"
                                className="max-w-xs max-h-48 rounded-lg object-cover border border-white/20 hover:opacity-90 transition-opacity"
                              />
                            </a>
                          </div>
                        )}

                        {/* Audio Attachment Player */}
                        {msg.media_type === "audio" && msg.media_url && (
                          <div className="mt-2">
                            <audio controls src={msg.media_url} className="h-8 max-w-full" />
                          </div>
                        )}

                        {/* Location Link */}
                        {msg.media_type === "location" && msg.location_lat && (
                          <div className="mt-2">
                            <a
                              href={`https://maps.google.com/?q=${msg.location_lat},${msg.location_lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30 hover:bg-emerald-500/30"
                            >
                              <span>📍 View Location on Google Maps</span>
                            </a>
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] text-white/30 mt-1 px-1">
                        {formatTime(msg.created_at)}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-white/30 italic">No previous messages found</p>
                )}
              </div>

              {/* Technician Reply Bar */}
              <div className="pt-4 border-t border-white/10 flex gap-3">
                <input
                  type="text"
                  value={replyInput}
                  onChange={(e) => setReplyInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendReply()}
                  placeholder="Send direct technician instructions or update to driver..."
                  className="flex-1 bg-[#0d1117] border border-white/15 rounded-lg px-4 py-2.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-indigo-500"
                />
                <button
                  onClick={handleSendReply}
                  disabled={sending || !replyInput.trim()}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-lg text-xs font-semibold transition-all"
                >
                  {sending ? "Sending..." : "Send to Driver"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
