"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import type { ConversationWithLastMessage, Message } from "@/lib/types";

let browserSupabase: ReturnType<typeof createClient> | null = null;

function getBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  if (!browserSupabase) {
    browserSupabase = createClient(url, key);
  }

  return browserSupabase;
}

export default function Dashboard() {
  const supabase = useMemo(() => getBrowserSupabase(), []);

  const [conversations, setConversations] = useState<ConversationWithLastMessage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selected = conversations.find((c) => c.id === selectedId);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations");
      const data = await res.json();
      if (!res.ok || !Array.isArray(data)) {
        setConversations([]);
        return;
      }
      setConversations(data);
    } catch (err) {
      console.error("Failed to fetch conversations", err);
    }
  }, []);

  const fetchMessages = useCallback(async (convoId: string) => {
    try {
      const res = await fetch(`/api/conversations/${convoId}/messages`);
      const data = await res.json();
      if (!res.ok || !Array.isArray(data)) {
        setMessages([]);
        return;
      }
      setMessages(data);
    } catch (err) {
      console.error("Failed to fetch messages", err);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    if (selectedId) fetchMessages(selectedId);
  }, [selectedId, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel("realtime-fleet")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const newMsg = payload.new as Message;
          if (newMsg.conversation_id === selectedId) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
          }
          fetchConversations();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => fetchConversations()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "issues" },
        () => fetchConversations()
      )
      .subscribe();

    return () => {
      supabase?.removeChannel(channel);
    };
  }, [selectedId, fetchConversations, supabase]);

  async function toggleMode() {
    if (!selected) return;
    const newMode = selected.mode === "agent" ? "human" : "agent";
    await fetch(`/api/conversations/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: newMode }),
    });
    setConversations((prev) =>
      prev.map((c) => (c.id === selected.id ? { ...c, mode: newMode } : c))
    );
  }

  async function handleSend() {
    if (!input.trim() || !selectedId || sending) return;
    setSending(true);
    await fetch(`/api/conversations/${selectedId}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: input.trim() }),
    });
    setInput("");
    setSending(false);
    fetchMessages(selectedId);
  }

  function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function getInitials(name: string | null, phone: string) {
    if (name) return name.slice(0, 2).toUpperCase();
    return phone.slice(-2);
  }

  const filteredConversations = conversations.filter((c) => {
    if (filterSeverity === "all") return true;
    if (filterSeverity === "resolved") return !c.active_issue_id;
    if (!c.active_issue) return false;
    return c.active_issue.severity === filterSeverity;
  });

  return (
    <div className="flex h-screen bg-[#0d1117] font-sans text-white">
      {/* Sidebar */}
      <div className="w-[340px] flex flex-col border-r border-white/10" style={{ background: "#161b22" }}>
        {/* Sidebar Header */}
        <div className="px-5 py-4 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center font-bold text-sm">
                🚚
              </div>
              <div>
                <h1 className="text-sm font-bold text-white leading-tight">Fleet Issue Dispatch</h1>
                <p className="text-[11px] text-white/40 leading-tight mt-0.5">
                  {conversations.length} Active Conversation{conversations.length !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
            <Link
              href="/technician"
              className="text-[10px] font-semibold px-2 py-1 bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600/50 rounded transition-all"
            >
              🛠️ Tech Portal
            </Link>
          </div>

          {/* Severity Filters */}
          <div className="flex items-center gap-1 mt-3.5 bg-black/30 p-1 rounded-lg border border-white/5">
            {[
              { id: "all", label: "All" },
              { id: "critical", label: "🔴 Critical" },
              { id: "major", label: "🟡 Major" },
              { id: "minor", label: "🟢 Minor" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterSeverity(tab.id)}
                className={`flex-1 text-[10px] py-1 rounded font-medium transition-all ${
                  filterSeverity === tab.id
                    ? "bg-white/15 text-white shadow"
                    : "text-white/40 hover:text-white/70"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto">
          {filteredConversations.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 gap-2 px-4 text-center">
              <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                <span>🚛</span>
              </div>
              <p className="text-xs text-white/40">No conversations in this filter</p>
            </div>
          )}
          {filteredConversations.map((convo) => {
            const isSelected = selectedId === convo.id;
            const issue = convo.active_issue;

            return (
              <button
                key={convo.id}
                onClick={() => setSelectedId(convo.id)}
                className={`w-full text-left px-4 py-3.5 transition-all duration-150 relative border-b border-white/5 group ${
                  isSelected ? "bg-white/[0.08]" : "hover:bg-white/[0.04]"
                }`}
              >
                {isSelected && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-9 bg-indigo-500 rounded-r" />
                )}
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-600 to-indigo-800 flex items-center justify-center flex-shrink-0 text-white text-xs font-semibold mt-0.5">
                    {getInitials(convo.driver?.full_name || convo.name, convo.phone)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-semibold text-white truncate">
                        {convo.driver?.full_name || convo.name || convo.phone}
                      </span>
                      <span className="text-[10px] text-white/30 flex-shrink-0">
                        {formatTime(convo.updated_at)}
                      </span>
                    </div>

                    {/* Vehicle Plate & Issue ID */}
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] font-mono text-amber-300 bg-amber-500/10 px-1 rounded">
                        {convo.vehicle?.plate_number || convo.phone.slice(-6)}
                      </span>
                      {issue && (
                        <span className="text-[9px] font-mono text-indigo-300 bg-indigo-500/10 px-1 rounded truncate">
                          {issue.issue_id}
                        </span>
                      )}
                    </div>

                    {/* Message Preview & Mode Badge */}
                    <div className="flex items-center justify-between gap-2 mt-1.5">
                      <p className="text-xs text-white/40 truncate flex-1">
                        {convo.last_message || "No messages yet"}
                      </p>
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 uppercase tracking-wide ${
                          convo.mode === "agent"
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/20"
                            : "bg-amber-500/20 text-amber-400 border border-amber-500/20"
                        }`}
                      >
                        {convo.mode === "agent" ? "AI" : "Human"}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Chat Panel */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#0d1117]">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center text-3xl">
              🛠️
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-white/60">Select a Driver Conversation</p>
              <p className="text-xs text-white/30 mt-1">Monitor driver issue reports and AI troubleshooting</p>
            </div>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="px-6 py-3 border-b border-white/10 flex items-center justify-between bg-[#161b22]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-600 to-indigo-800 flex items-center justify-center text-white text-xs font-semibold">
                  {getInitials(selected.driver?.full_name || selected.name, selected.phone)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-white leading-tight">
                      {selected.driver?.full_name || selected.name || selected.phone}
                    </h2>
                    <span className="text-xs font-mono text-amber-400 bg-amber-400/10 px-1.5 rounded">
                      {selected.vehicle?.plate_number || "Unit " + selected.phone.slice(-4)}
                    </span>
                  </div>
                  <p className="text-xs text-white/40 leading-tight mt-0.5">{selected.phone}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {selected.active_issue && (
                  <Link
                    href={`/technician?id=${selected.active_issue.issue_id}`}
                    className="text-xs px-2.5 py-1 rounded bg-indigo-500/20 text-indigo-300 font-mono border border-indigo-500/30 hover:bg-indigo-500/30"
                  >
                    Ticket: {selected.active_issue.issue_id}
                  </Link>
                )}

                <button
                  onClick={toggleMode}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                    selected.mode === "agent"
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25"
                      : "bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      selected.mode === "agent" ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
                    }`}
                  />
                  {selected.mode === "agent" ? "AI Agent Mode" : "Human Dispatch Takeover"}
                </button>
              </div>
            </div>

            {/* Active Issue Summary Banner */}
            {selected.active_issue && (
              <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-amber-400 font-bold">⚠️ Active Support Ticket:</span>
                  <span className="text-white font-medium">{selected.active_issue.category}</span>
                  <span className="text-white/40">({selected.active_issue.severity} severity)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-white/50">Status: {selected.active_issue.status}</span>
                </div>
              </div>
            )}

            {/* Message Thread */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {messages.map((msg, i) => {
                const isUser = msg.role === "user";
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isUser ? "justify-start" : "justify-end"}`}
                  >
                    <div className={`flex flex-col ${isUser ? "items-start" : "items-end"} max-w-[70%]`}>
                      <div
                        className={`px-4 py-3 rounded-2xl text-xs leading-relaxed ${
                          isUser
                            ? "bg-[#161b22] text-white/90 rounded-tl-sm border border-white/10"
                            : "bg-indigo-600 text-white rounded-tr-sm"
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{msg.content}</p>

                        {/* Image Preview */}
                        {msg.media_type === "image" && msg.media_url && (
                          <div className="mt-2">
                            <a href={msg.media_url} target="_blank" rel="noopener noreferrer">
                              <img
                                src={msg.media_url}
                                alt="Driver attachment"
                                className="max-w-xs max-h-48 rounded-lg object-cover border border-white/20 hover:opacity-90 transition-opacity"
                              />
                            </a>
                          </div>
                        )}

                        {/* Audio Player */}
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
                              <span>📍 Google Maps Coordinates</span>
                            </a>
                          </div>
                        )}
                      </div>

                      <p className="text-[10px] text-white/30 mt-1 px-1">
                        {!isUser && <span className="text-indigo-400/80 mr-1">AI Agent ·</span>}
                        {formatTime(msg.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Dispatcher Input Bar */}
            <div className="px-6 py-4 border-t border-white/10 bg-[#161b22]">
              <div className="flex items-center gap-3 bg-[#0d1117] rounded-xl px-4 py-2.5 border border-white/15 focus-within:border-indigo-500 transition-colors">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                  placeholder={
                    selected.mode === "human"
                      ? "Send message as Dispatcher to Driver..."
                      : "Switch to Human Mode to reply manually..."
                  }
                  className="flex-1 bg-transparent text-xs text-white placeholder:text-white/30 focus:outline-none"
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !input.trim()}
                  className="w-8 h-8 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center justify-center flex-shrink-0"
                >
                  {sending ? (
                    <span className="text-xs">...</span>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
