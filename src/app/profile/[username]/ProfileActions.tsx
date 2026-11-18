"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Check, X, ShieldOff, Flag, Loader2 } from "lucide-react";
import { api } from "@/lib/client/api";

export function ProfileActions({
  targetId,
  targetName,
  friendshipStatus,
  friendshipId,
  blocked,
}: {
  targetId: string;
  targetName: string;
  friendshipStatus: "pending" | "accepted" | "blocked" | null;
  friendshipId: string | null;
  blocked: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(friendshipStatus);
  const [requestId, setRequestId] = useState(friendshipId);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("Spam");
  const [reportDetail, setReportDetail] = useState("");
  const [reported, setReported] = useState(false);

  async function act(path: string, method: string, body?: unknown) {
    setBusy(true);
    try {
      await api(path, { method, body: body ? JSON.stringify(body) : undefined });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function sendRequest() {
    setBusy(true);
    try {
      const res = await api<{ friendship: { id: string; status: string } }>("/api/friends", {
        method: "POST",
        body: JSON.stringify({ addresseeId: targetId }),
      });
      setRequestId(res.friendship.id);
      setStatus(res.friendship.status as typeof status);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function respond(action: "accept" | "reject") {
    if (!requestId) return;
    setBusy(true);
    try {
      if (action === "accept") {
        await api(`/api/friends/${requestId}`, { method: "PATCH", body: JSON.stringify({ action: "accept" }) });
        setStatus("accepted");
      } else {
        await api(`/api/friends/${requestId}`, { method: "PATCH", body: JSON.stringify({ action: "reject" }) });
        setStatus(null);
        setRequestId(null);
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function submitReport(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/reports", {
        method: "POST",
        body: JSON.stringify({ reportedId: targetId, reason: reportReason, detail: reportDetail }),
      });
      setReported(true);
      setReportOpen(false);
    } finally {
      setBusy(false);
    }
  }

  if (blocked) {
    return (
      <button
        disabled={busy}
        onClick={() => act(`/api/blocks?userId=${encodeURIComponent(targetId)}`, "DELETE")}
        className="flex items-center gap-2 rounded-lg border border-ink-500 px-3 py-2 text-xs font-semibold text-cream-300 hover:text-cream-100"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldOff size={14} />}
        Unblock {targetName}
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {status === "accepted" ? (
        <button
          disabled={busy}
          onClick={() => act(`/api/friends/${targetId}`, "DELETE")}
          className="rounded-lg border border-ink-500 px-3 py-2 text-xs font-semibold text-cream-300 hover:text-cream-100"
        >
          Remove friend
        </button>
      ) : status === "pending" ? (
        <div className="flex gap-2">
          <button
            disabled={busy}
            onClick={() => respond("accept")}
            title="Accept request"
            aria-label="Accept request"
            className="rounded-lg bg-accent p-2 text-[#1b1917] hover:bg-accent-hover"
          >
            <Check size={16} />
          </button>
          <button
            disabled={busy}
            onClick={() => respond("reject")}
            title="Reject request"
            aria-label="Reject request"
            className="rounded-lg border border-ink-500 p-2 text-cream-400 hover:text-cream-100"
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <button
          disabled={busy}
          onClick={sendRequest}
          className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-xs font-bold text-[#1b1917] hover:bg-accent-hover"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
          Add friend
        </button>
      )}

      <div className="flex gap-2">
        <button
          disabled={busy}
          onClick={() => act("/api/blocks", "POST", { userId: targetId })}
          title="Block user"
          aria-label="Block user"
          className="flex items-center gap-1 rounded-lg border border-ink-500 p-2 text-cream-500 hover:text-cream-100"
        >
          <ShieldOff size={13} />
        </button>
        <button
          disabled={busy}
          onClick={() => setReportOpen((v) => !v)}
          title="Report user"
          aria-label="Report user"
          className="flex items-center gap-1 rounded-lg border border-ink-500 p-2 text-cream-500 hover:text-cream-100"
        >
          <Flag size={13} />
        </button>
      </div>
      {reported && <p className="text-[11px] text-accent">Report submitted. Thank you.</p>}

      {reportOpen && (
        <form onSubmit={submitReport} className="w-64 rounded-xl border border-ink-500 bg-ink-800 p-3 text-left">
          <label htmlFor="report-reason" className="text-[10px] font-bold uppercase tracking-wide text-cream-500">
            Reason
          </label>
          <select
            id="report-reason"
            value={reportReason}
            onChange={(e) => setReportReason(e.target.value)}
            className="mt-1 w-full rounded-lg border border-ink-500 bg-ink-700 px-2 py-1.5 text-xs text-cream-100"
          >
            {["Spam", "Harassment", "Hate speech", "Inappropriate content", "Impersonation", "Other"].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <label htmlFor="report-detail" className="mt-2 block text-[10px] font-bold uppercase tracking-wide text-cream-500">
            Details
          </label>
          <textarea
            id="report-detail"
            value={reportDetail}
            onChange={(e) => setReportDetail(e.target.value)}
            rows={3}
            maxLength={1000}
            className="mt-1 w-full resize-none rounded-lg border border-ink-500 bg-ink-700 px-2 py-1.5 text-xs text-cream-100"
          />
          <button
            type="submit"
            disabled={busy}
            className="mt-2 w-full rounded-lg bg-[#d0342c] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#b02a23]"
          >
            Submit report
          </button>
        </form>
      )}
    </div>
  );
}
