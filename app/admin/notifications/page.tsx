"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "@/lib/firebase";
import { useToast } from "@/components/ui/ToastProvider";
import { getHomeRouteForRole, normalizeRole } from "@/lib/roles";

type UserRow = {
  id: string;
  email?: string;
  name?: string;
  displayName?: string;
  username?: string;
  role?: string;
};

type ProfileRow = {
  id: string;
  userId?: string;
  email?: string;
  fullName?: string;
  clientStatus?: "active" | "inactive";
};

type Audience = "all" | "selected";
type RecipientVisibility = "active" | "all";

function normalizeLookupValue(value?: string) {
  return (value || "").trim().toLowerCase();
}

function getRecipientName(user: UserRow, profile?: ProfileRow) {
  return (
    profile?.fullName ||
    user.displayName ||
    user.name ||
    user.username ||
    user.email ||
    user.id
  );
}

export default function AdminNotificationsPage() {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("/dashboard");
  const [audience, setAudience] = useState<Audience>("all");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [recipientVisibility, setRecipientVisibility] =
    useState<RecipientVisibility>("active");
  const [recipientSearch, setRecipientSearch] = useState("");
  const [sending, setSending] = useState(false);

  const { showToast } = useToast();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      try {
        if (!currentUser) {
          window.location.replace("/login");
          return;
        }

        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          window.location.replace("/login");
          return;
        }

        const authData = userSnap.data() as { role?: string };

        const role = normalizeRole(authData.role);
        if (role !== "admin") {
          window.location.replace(getHomeRouteForRole(role));
          return;
        }

        setAllowed(true);

        const [usersSnap, profilesSnap] = await Promise.all([
          getDocs(collection(db, "users")),
          getDocs(collection(db, "profiles")),
        ]);

        const rows = usersSnap.docs
          .map((userDoc) => ({
            id: userDoc.id,
            ...(userDoc.data() as Omit<UserRow, "id">),
          }))
          .filter((item) => item.role !== "admin") as UserRow[];

        const profileRows = profilesSnap.docs.map((profileDoc) => ({
          id: profileDoc.id,
          ...(profileDoc.data() as Omit<ProfileRow, "id">),
        })) as ProfileRow[];

        rows.sort((a, b) =>
          getRecipientName(a).localeCompare(getRecipientName(b))
        );
        setUsers(rows);
        setProfiles(profileRows);
      } catch (error) {
        console.error("Notifications admin screen error:", error);
        showToast({
          title: "Could not load notification center",
          description: "Please refresh the page.",
          type: "error",
        });
        window.location.replace("/admin");
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [showToast]);

  const canSend = useMemo(() => {
    const hasAudience = audience === "all" || selectedUserIds.length > 0;
    return title.trim().length > 0 && body.trim().length > 0 && hasAudience;
  }, [title, body, audience, selectedUserIds]);

  const recipients = useMemo(() => {
    const profileByUserId = new Map(
      profiles
        .filter((profile) => normalizeLookupValue(profile.userId))
        .map((profile) => [normalizeLookupValue(profile.userId), profile])
    );
    const profileByEmail = new Map(
      profiles
        .filter((profile) => normalizeLookupValue(profile.email))
        .map((profile) => [normalizeLookupValue(profile.email), profile])
    );

    return users
      .map((user) => {
        const profile =
          profileByUserId.get(normalizeLookupValue(user.id)) ||
          profileByEmail.get(normalizeLookupValue(user.email));
        const clientStatus = profile?.clientStatus || "active";
        const displayName = getRecipientName(user, profile);

        return {
          id: user.id,
          email: user.email || "",
          displayName,
          clientStatus,
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [profiles, users]);

  const visibleRecipients = useMemo(() => {
    const filteredByVisibility =
      recipientVisibility === "all"
        ? recipients
        : recipients.filter((recipient) => recipient.clientStatus === "active");

    const query = recipientSearch.trim().toLowerCase();

    if (!query) return filteredByVisibility;

    return filteredByVisibility.filter((recipient) => {
      const haystack = `${recipient.displayName} ${recipient.email} ${recipient.id}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [recipientSearch, recipientVisibility, recipients]);

  const toggleUser = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const sendPush = async () => {
    if (!canSend || sending) return;

    setSending(true);

    try {
      const sendPushCall = httpsCallable(functions, "sendPushNotification");

      const result = await sendPushCall({
        title: title.trim(),
        body: body.trim(),
        url: (url.trim() || "/dashboard").startsWith("/") ? url.trim() || "/dashboard" : "/dashboard",
        audience,
        selectedUserIds: audience === "selected" ? selectedUserIds : [],
      });

      const data = (result.data || {}) as {
        successCount?: number;
        failureCount?: number;
        targetedUsers?: number;
        usersWithoutTokens?: string[];
        unresolvedRecipients?: string[];
      };

      const unresolvedCount = data.unresolvedRecipients?.length || 0;
      const noTokenCount = data.usersWithoutTokens?.length || 0;

      showToast({
        title: "Notification sent",
        description: `Users targeted: ${data.targetedUsers || 0} · Delivered: ${data.successCount || 0} · Failed: ${data.failureCount || 0}${unresolvedCount ? ` · Unresolved recipients: ${unresolvedCount}` : ""}${noTokenCount ? ` · No token: ${noTokenCount}` : ""}`,
        type: "success",
      });

      setTitle("");
      setBody("");
      setUrl("/dashboard");
      setAudience("all");
      setSelectedUserIds([]);
    } catch (error) {
      console.error("Send push error:", error);
      showToast({
        title: "Send failed",
        description: "Push notification could not be sent.",
        type: "error",
      });
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
        <p className="text-sm font-medium text-slate-500">Loading notification center...</p>
      </div>
    );
  }

  if (!allowed) return null;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[32px] border border-white/70 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur">
        <div className="bg-gradient-to-r from-[#071120] via-[#123b76] to-[#2EA0FF] p-[1px]">
          <div className="rounded-t-[31px] bg-transparent px-0 py-0" />
        </div>

        <div className="relative overflow-hidden p-6 md:p-8">
          <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-[#2EA0FF]/10 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full bg-emerald-300/10 blur-3xl" />

          <div className="relative">
            <div className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1d4ed8]">
              Notifications
            </div>

            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
              Push Notification Center
            </h1>
            <p className="mt-3 max-w-3xl text-sm text-slate-600 md:text-base">
              Send web push notifications to all users or selected users. Default deep link is <code>/dashboard</code>.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <HeaderPill label="Recipients" value={String(recipients.length)} />
              <HeaderPill label="Selected" value={String(selectedUserIds.length)} />
              <HeaderPill label="Audience" value={audience} />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              placeholder="Session update"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">Deep link URL</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="/dashboard"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-2 block text-sm font-semibold text-slate-700">Message</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={240}
            rows={4}
            placeholder="Your coach has posted this week's training schedule."
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
          />
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <button
            onClick={() => setAudience("all")}
            className={`rounded-2xl border px-4 py-3 text-left text-sm font-medium transition ${
              audience === "all"
                ? "border-slate-900 bg-slate-950 text-white"
                : "border-slate-200 bg-white text-slate-700"
            }`}
          >
            All users
          </button>

          <button
            onClick={() => setAudience("selected")}
            className={`rounded-2xl border px-4 py-3 text-left text-sm font-medium transition ${
              audience === "selected"
                ? "border-slate-900 bg-slate-950 text-white"
                : "border-slate-200 bg-white text-slate-700"
            }`}
          >
            Selected users
          </button>
        </div>

        {audience === "selected" && (
          <div className="mt-4 rounded-[22px] border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4">
            <p className="text-sm font-semibold text-slate-700">
              Select recipients ({selectedUserIds.length} selected)
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {(["active", "all"] as const).map((visibility) => (
                <button
                  key={visibility}
                  type="button"
                  onClick={() => setRecipientVisibility(visibility)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    recipientVisibility === visibility
                      ? "bg-slate-950 text-white"
                      : "border border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  {visibility === "active" ? "Active only" : "All users"}
                </button>
              ))}
            </div>

            <input
              value={recipientSearch}
              onChange={(e) => setRecipientSearch(e.target.value)}
              placeholder="Search selected recipients by name or email"
              className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
            />

            <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto pr-1">
              {visibleRecipients.map((item) => (
                <label
                  key={item.id}
                  className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3"
                >
                  <input
                    type="checkbox"
                    checked={selectedUserIds.includes(item.id)}
                    onChange={() => toggleUser(item.id)}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-slate-900">
                        {item.displayName}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          item.clientStatus === "inactive"
                            ? "bg-rose-100 text-rose-700"
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {item.clientStatus}
                      </span>
                    </div>
                    <p className="truncate text-xs text-slate-500">
                      {item.email || item.id}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={sendPush}
            disabled={!canSend || sending}
            className="rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {sending ? "Sending..." : "Send push notification"}
          </button>

          <p className="text-xs text-slate-500">Only users with a valid push token will receive notifications.</p>
        </div>
        </div>

        <div className="space-y-6">
          <section className="rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
            <h2 className="text-xl font-semibold text-slate-950">Live preview</h2>
            <p className="mt-2 text-sm text-slate-600">
              This is roughly how the notification content will appear when a device receives it.
            </p>

            <div className="mt-5 rounded-[26px] border border-slate-200 bg-gradient-to-br from-slate-950 to-slate-800 p-5 text-white shadow-[0_18px_40px_rgba(15,23,42,0.18)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                Bootcamp
              </p>
              <p className="mt-3 text-lg font-semibold">
                {title.trim() || "Notification title"}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-200">
                {body.trim() || "Notification message preview will appear here."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <PreviewPill label="Link" value={(url.trim() || "/dashboard").startsWith("/") ? url.trim() || "/dashboard" : "/dashboard"} />
                <PreviewPill
                  label="Audience"
                  value={
                    audience === "all"
                      ? "All users"
                      : `${selectedUserIds.length} selected`
                  }
                />
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-[#bfdbfe] bg-gradient-to-br from-[#eff6ff] to-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)]">
            <h2 className="text-lg font-semibold text-slate-950">iPhone limitation</h2>
            <p className="mt-2 text-sm text-slate-700">
              Push on iPhone and iPad web apps is constrained. It generally needs Home Screen installation and compatible iOS browser support.
            </p>
          </section>
        </div>
      </section>
    </div>
  );
}

function HeaderPill({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">
      {label}: <span className="text-slate-950 capitalize">{value}</span>
    </div>
  );
}

function PreviewPill({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/90">
      {label}: {value}
    </div>
  );
}
