"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
  where,
  query,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/components/ui/ToastProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { getRoleLabel } from "@/lib/roles";
import SegmentedTabs from "@/components/ui/SegmentedTabs";
import CollapsiblePanel from "@/components/ui/CollapsiblePanel";
import {
  canRoleAccessThread,
  formatThreadTimestamp,
  getAllowedThreadCategories,
  getMessageCategoryClasses,
  getMessageCategoryLabel,
  getThreadStatusClasses,
  MessageCategory,
  MessageThreadRecord,
  MessageThreadStatus,
  sortThreadMessages,
  sortThreads,
  ThreadMessageRecord,
} from "@/lib/messages";

type ProfileOption = {
  id: string;
  fullName?: string;
  userId?: string;
  clientStatus?: "active" | "inactive";
  assignedProgram?: string;
};

type MessageTab = "inbox" | "thread" | "compose";

export default function MessageCenter({
  scope,
}: {
  scope: "admin" | "staff" | "client";
}) {
  const { firebaseUser, appUser, authLoading, profileLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [threads, setThreads] = useState<MessageThreadRecord[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState("");
  const [messages, setMessages] = useState<ThreadMessageRecord[]>([]);
  const [threadSearch, setThreadSearch] = useState("");
  const [profileSearch, setProfileSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | MessageThreadStatus>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | MessageCategory>("all");
  const [threadForm, setThreadForm] = useState({
    clientProfileId: "",
    category: "general" as MessageCategory,
    subject: "",
    openingMessage: "",
  });
  const [replyBody, setReplyBody] = useState("");
  const [activeTab, setActiveTab] = useState<MessageTab>("inbox");

  const { showToast } = useToast();
  const role = appUser?.role || "user";
  const loadingAuth = authLoading || profileLoading;

  const allowedCategories = useMemo(
    () => getAllowedThreadCategories(role),
    [role]
  );

  const loadMessages = useCallback(async (threadId: string) => {
    const snapshot = await getDocs(collection(db, "messageThreads", threadId, "messages"));
    const rows = sortThreadMessages(
      snapshot.docs.map((docItem) => ({
        id: docItem.id,
        ...(docItem.data() as Omit<ThreadMessageRecord, "id">),
      })) as ThreadMessageRecord[]
    );
    setMessages(rows);
  }, []);

  const loadData = useCallback(async () => {
    if (!firebaseUser || !appUser) return;

    const [threadsSnap, profilesSnap] = await Promise.all([
      getDocs(collection(db, "messageThreads")),
      scope === "client"
        ? getDocs(query(collection(db, "profiles"), where("userId", "==", firebaseUser.uid)))
        : getDocs(collection(db, "profiles")),
    ]);

    const profileRows = profilesSnap.docs
      .map((docItem) => ({
        id: docItem.id,
        ...(docItem.data() as Omit<ProfileOption, "id">),
      }))
      .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || "")) as ProfileOption[];

    const threadRows = sortThreads(
      (threadsSnap.docs.map((docItem) => ({
        id: docItem.id,
        ...(docItem.data() as Omit<MessageThreadRecord, "id">),
      })) as MessageThreadRecord[]).filter((thread) =>
        canRoleAccessThread(thread, role, firebaseUser.uid)
      )
    );

    setProfiles(profileRows);
    setThreads(threadRows);

    if (scope === "client" && profileRows[0]) {
      setThreadForm((prev) => ({
        ...prev,
        clientProfileId: profileRows[0].id,
      }));
    }

    const nextThreadId =
      selectedThreadId && threadRows.some((item) => item.id === selectedThreadId)
        ? selectedThreadId
        : threadRows[0]?.id || "";

    setSelectedThreadId(nextThreadId);

    if (nextThreadId) {
      await loadMessages(nextThreadId);
    } else {
      setMessages([]);
    }
  }, [appUser, firebaseUser, loadMessages, role, scope, selectedThreadId]);

  useEffect(() => {
    const init = async () => {
      if (loadingAuth) return;
      if (!firebaseUser || !appUser) {
        setLoading(false);
        return;
      }

      try {
        await loadData();
      } catch (error) {
        console.error("Load message center error:", error);
        showToast({
          title: "Could not load inbox",
          description: "Please refresh the page.",
          type: "error",
        });
      } finally {
        setLoading(false);
      }
    };

    void init();
  }, [appUser, firebaseUser, loadData, loadingAuth, showToast]);

  const visibleProfiles = useMemo(() => {
    const queryText = profileSearch.trim().toLowerCase();
    return profiles.filter((profile) => {
      const haystack =
        `${profile.fullName || ""} ${profile.assignedProgram || ""}`.toLowerCase();
      return !queryText || haystack.includes(queryText);
    });
  }, [profileSearch, profiles]);

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) || null,
    [selectedThreadId, threads]
  );

  useEffect(() => {
    if (selectedThreadId) {
      setActiveTab("thread");
    }
  }, [selectedThreadId]);

  const visibleThreads = useMemo(() => {
    const queryText = threadSearch.trim().toLowerCase();

    return threads.filter((thread) => {
      const matchesStatus = statusFilter === "all" || thread.status === statusFilter;
      const matchesCategory =
        categoryFilter === "all" || thread.category === categoryFilter;
      const haystack =
        `${thread.subject || ""} ${thread.clientName || ""} ${thread.lastMessagePreview || ""}`.toLowerCase();
      const matchesSearch = !queryText || haystack.includes(queryText);
      return matchesStatus && matchesCategory && matchesSearch;
    });
  }, [categoryFilter, statusFilter, threadSearch, threads]);

  const summary = useMemo(
    () => ({
      total: threads.length,
      open: threads.filter((thread) => thread.status === "open").length,
      closed: threads.filter((thread) => thread.status === "closed").length,
      unread: threads.filter(
        (thread) =>
          firebaseUser?.uid &&
          !thread.readByUserIds?.includes(firebaseUser.uid) &&
          thread.lastSenderRole !== role
      ).length,
    }),
    [firebaseUser?.uid, role, threads]
  );

  const markThreadAsRead = useCallback(
    async (threadId: string) => {
      if (!firebaseUser?.uid) return;

      const thread = threads.find((item) => item.id === threadId);
      if (!thread) return;

      const alreadyRead = thread.readByUserIds?.includes(firebaseUser.uid);
      if (alreadyRead) return;

      await updateDoc(doc(db, "messageThreads", threadId), {
        readByUserIds: [...new Set([...(thread.readByUserIds || []), firebaseUser.uid])],
      });
    },
    [firebaseUser?.uid, threads]
  );

  const createThread = async () => {
    if (!firebaseUser || !appUser) return;

    const subject = threadForm.subject.trim();
    const openingMessage = threadForm.openingMessage.trim();
    const clientProfileId = threadForm.clientProfileId;
    const selectedProfile = profiles.find((profile) => profile.id === clientProfileId);

    if (!subject || !openingMessage || !selectedProfile) {
      showToast({
        title: "Missing information",
        description: "Please choose a client, subject, and opening message.",
        type: "error",
      });
      return;
    }

    setSending(true);

    try {
      const threadPayload = {
        clientProfileId,
        clientUserId: selectedProfile.userId || "",
        clientName: selectedProfile.fullName || "",
        category: threadForm.category,
        subject,
        status: "open" as MessageThreadStatus,
        participantRoles: [appUser.role, "user"],
        participantUserIds: [firebaseUser.uid, selectedProfile.userId || ""].filter(Boolean),
        createdByUid: firebaseUser.uid,
        createdByRole: appUser.role,
        createdAt: serverTimestamp(),
        lastMessageAt: serverTimestamp(),
        lastMessagePreview: openingMessage.slice(0, 160),
        lastSenderRole: appUser.role,
        readByUserIds: [firebaseUser.uid],
      };

      const threadRef = await addDoc(collection(db, "messageThreads"), threadPayload);

      await addDoc(collection(db, "messageThreads", threadRef.id, "messages"), {
        body: openingMessage,
        senderUid: firebaseUser.uid,
        senderRole: appUser.role,
        senderName: appUser.name || appUser.email || getRoleLabel(appUser.role),
        createdAt: serverTimestamp(),
      });

      setThreadForm({
        clientProfileId: scope === "client" ? clientProfileId : "",
        category: allowedCategories[0] || "general",
        subject: "",
        openingMessage: "",
      });

      await loadData();
      setSelectedThreadId(threadRef.id);
      setActiveTab("thread");
      await loadMessages(threadRef.id);

      showToast({
        title: "Thread created",
        description: "Your message thread is ready.",
        type: "success",
      });
    } catch (error) {
      console.error("Create thread error:", error);
      showToast({
        title: "Could not create thread",
        description: "Please try again.",
        type: "error",
      });
    } finally {
      setSending(false);
    }
  };

  const sendReply = async () => {
    if (!firebaseUser || !appUser || !selectedThread) return;

    const body = replyBody.trim();
    if (!body) return;

    setSending(true);

    try {
      await addDoc(collection(db, "messageThreads", selectedThread.id, "messages"), {
        body,
        senderUid: firebaseUser.uid,
        senderRole: appUser.role,
        senderName: appUser.name || appUser.email || getRoleLabel(appUser.role),
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, "messageThreads", selectedThread.id), {
        lastMessageAt: serverTimestamp(),
        lastMessagePreview: body.slice(0, 160),
        lastSenderRole: appUser.role,
        status: "open",
        readByUserIds: [firebaseUser.uid],
      });

      setReplyBody("");
      await loadData();
      setActiveTab("thread");
      await loadMessages(selectedThread.id);
    } catch (error) {
      console.error("Reply thread error:", error);
      showToast({
        title: "Could not send reply",
        description: "Please try again.",
        type: "error",
      });
    } finally {
      setSending(false);
    }
  };

  const toggleThreadStatus = async () => {
    if (!selectedThread) return;

    const nextStatus: MessageThreadStatus =
      selectedThread.status === "open" ? "closed" : "open";

    try {
      await updateDoc(doc(db, "messageThreads", selectedThread.id), {
        status: nextStatus,
      });
      await loadData();
      showToast({
        title: nextStatus === "open" ? "Thread reopened" : "Thread closed",
        description:
          nextStatus === "open"
            ? "The conversation is active again."
            : "The conversation was marked as closed.",
        type: "success",
      });
    } catch (error) {
      console.error("Toggle thread status error:", error);
      showToast({
        title: "Could not update thread",
        description: "Please try again.",
        type: "error",
      });
    }
  };

  const deleteThread = async () => {
    if (!selectedThread) return;

    const confirmed = window.confirm(
      "Delete this thread permanently? This will remove the full conversation history."
    );

    if (!confirmed) return;

    setDeleting(true);

    try {
      const messagesSnap = await getDocs(
        collection(db, "messageThreads", selectedThread.id, "messages")
      );

      await Promise.all(messagesSnap.docs.map((docItem) => deleteDoc(docItem.ref)));
      await deleteDoc(doc(db, "messageThreads", selectedThread.id));

      const deletedThreadId = selectedThread.id;

      setSelectedThreadId("");
      setMessages([]);
      setReplyBody("");

      await loadData();

      showToast({
        title: "Thread deleted",
        description: "The conversation was removed from the inbox.",
        type: "success",
      });

      if (selectedThreadId === deletedThreadId) {
        setSelectedThreadId("");
      }
    } catch (error) {
      console.error("Delete thread error:", error);
      showToast({
        title: "Could not delete thread",
        description: "Please try again.",
        type: "error",
      });
    } finally {
      setDeleting(false);
    }
  };

  if (loading || loadingAuth) {
    return (
      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
        <p className="text-sm font-medium text-slate-500">Loading inbox...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[32px] border border-white/70 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur">
        <div className="bg-gradient-to-r from-[#071120] via-[#123b76] to-[#2EA0FF] p-[1px]">
          <div className="rounded-t-[31px] bg-transparent px-0 py-0" />
        </div>
        <div className="relative overflow-hidden p-6 md:p-8">
          <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-[#2EA0FF]/10 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full bg-emerald-300/10 blur-3xl" />
          <div className="relative">
            <div className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1d4ed8]">
              Inbox
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
              Messaging Center
            </h1>
            <p className="mt-3 max-w-3xl text-sm text-slate-600 md:text-base">
              Threaded communication between clients and staff. Keep private session
              questions, coaching follow-ups, and nutrition support in one structured inbox.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <HeaderPill label="Viewer" value={getRoleLabel(role)} />
              <HeaderPill label="Threads" value={String(summary.total)} />
              <HeaderPill label="Unread" value={String(summary.unread)} />
            </div>

            <div className="mt-6">
              <SegmentedTabs<MessageTab>
                items={[
                  { id: "inbox", label: "Inbox" },
                  { id: "thread", label: "Current thread" },
                  { id: "compose", label: "New thread" },
                ]}
                value={activeTab}
                onChange={setActiveTab}
              />
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <section className="space-y-6">
          {activeTab === "compose" ? (
            <section className="rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
              <h2 className="text-xl font-semibold text-slate-950">New thread</h2>
              <p className="mt-2 text-sm text-slate-600">
                Start one structured conversation. Keep the first message focused.
              </p>

              <div className="mt-6 space-y-4">
                {scope !== "client" ? (
                  <>
                    <Field label="Find client">
                      <input
                        value={profileSearch}
                        onChange={(e) => setProfileSearch(e.target.value)}
                        placeholder="Search by client name or program..."
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                      />
                    </Field>

                    <Field label="Client">
                      <select
                        value={threadForm.clientProfileId}
                        onChange={(e) =>
                          setThreadForm((prev) => ({
                            ...prev,
                            clientProfileId: e.target.value,
                          }))
                        }
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                      >
                        <option value="">Select client</option>
                        {visibleProfiles.map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profile.fullName || "Unnamed profile"}
                            {profile.assignedProgram ? ` — ${profile.assignedProgram}` : ""}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </>
                ) : null}

                <Field label="Category">
                  <select
                    value={threadForm.category}
                    onChange={(e) =>
                      setThreadForm((prev) => ({
                        ...prev,
                        category: e.target.value as MessageCategory,
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                  >
                    {allowedCategories.map((category) => (
                      <option key={category} value={category}>
                        {getMessageCategoryLabel(category)}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Subject">
                  <input
                    value={threadForm.subject}
                    onChange={(e) =>
                      setThreadForm((prev) => ({ ...prev, subject: e.target.value }))
                    }
                    placeholder="What is this thread about?"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                  />
                </Field>

                <Field label="Opening message">
                  <textarea
                    rows={6}
                    value={threadForm.openingMessage}
                    onChange={(e) =>
                      setThreadForm((prev) => ({
                        ...prev,
                        openingMessage: e.target.value,
                      }))
                    }
                    placeholder="Write the first message for this thread..."
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                  />
                </Field>

                <button
                  type="button"
                  onClick={createThread}
                  disabled={sending}
                  className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  {sending ? "Saving..." : "Create thread"}
                </button>
              </div>
            </section>
          ) : (
            <section className="rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-slate-950">Thread list</h2>
                  <p className="mt-2 text-sm text-slate-600">
                    Keep only the most relevant conversations in view.
                  </p>
                </div>
                <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
                  {visibleThreads.length} visible
                </div>
              </div>

              <CollapsiblePanel
                title="Search and filters"
                description="Use this only when you need to narrow the inbox."
              >
                <div className="space-y-3">
                  <input
                    value={threadSearch}
                    onChange={(e) => setThreadSearch(e.target.value)}
                    placeholder="Search threads..."
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe]"
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <select
                      value={categoryFilter}
                      onChange={(e) =>
                        setCategoryFilter(e.target.value as "all" | MessageCategory)
                      }
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none"
                    >
                      <option value="all">All categories</option>
                      {allowedCategories.map((category) => (
                        <option key={category} value={category}>
                          {getMessageCategoryLabel(category)}
                        </option>
                      ))}
                    </select>

                    <select
                      value={statusFilter}
                      onChange={(e) =>
                        setStatusFilter(e.target.value as "all" | MessageThreadStatus)
                      }
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none"
                    >
                      <option value="all">All status</option>
                      <option value="open">Open</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>
                </div>
              </CollapsiblePanel>

              <div className="mt-5 space-y-3">
                {visibleThreads.length === 0 ? (
                  <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center text-sm text-slate-500">
                    No threads match the current filters.
                  </div>
                ) : (
                  visibleThreads.map((thread) => (
                    <button
                      key={thread.id}
                      type="button"
                      onClick={async () => {
                        setSelectedThreadId(thread.id);
                        setActiveTab("thread");
                        await loadMessages(thread.id);
                        await markThreadAsRead(thread.id);
                        await loadData();
                      }}
                      className={[
                        "w-full rounded-[22px] border p-4 text-left transition",
                        selectedThreadId === thread.id
                          ? "border-[#bfdbfe] bg-[#eff6ff]/70 shadow-sm"
                          : "border-slate-100 bg-white hover:border-slate-200",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-950">
                            {thread.subject}
                          </p>
                          <p className="mt-1 truncate text-xs text-slate-500">
                            {thread.clientName || "Client thread"}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap justify-end gap-2">
                          {firebaseUser?.uid &&
                          !thread.readByUserIds?.includes(firebaseUser.uid) &&
                          thread.lastSenderRole !== role ? (
                            <span className="rounded-full border border-[#dbeafe] bg-[#eff6ff] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1d4ed8]">
                              unread
                            </span>
                          ) : null}
                          <span
                            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${getThreadStatusClasses(thread.status)}`}
                          >
                            {thread.status}
                          </span>
                        </div>
                      </div>
                      <p className="mt-3 line-clamp-2 text-sm text-slate-600">
                        {thread.lastMessagePreview || "No preview yet."}
                      </p>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${getMessageCategoryClasses(thread.category)}`}
                        >
                          {getMessageCategoryLabel(thread.category)}
                        </span>
                        <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                          {formatThreadTimestamp(thread.lastMessageAt || thread.createdAt)}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </section>
          )}
        </section>

        <section className="rounded-[28px] border border-white/70 bg-white/95 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur">
          {!selectedThread ? (
            <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/70 p-10 text-center text-sm text-slate-500">
              Select a thread to read and reply.
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-col gap-4 border-b border-slate-100 pb-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${getMessageCategoryClasses(selectedThread.category)}`}
                  >
                    {getMessageCategoryLabel(selectedThread.category)}
                  </span>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${getThreadStatusClasses(selectedThread.status)}`}
                  >
                    {selectedThread.status}
                  </span>
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-slate-950">
                    {selectedThread.subject}
                  </h2>
                  <p className="mt-2 text-sm text-slate-600">
                    {selectedThread.clientName || "Unknown client"} ·{" "}
                    {formatThreadTimestamp(
                      selectedThread.lastMessageAt || selectedThread.createdAt
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={toggleThreadStatus}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    {selectedThread.status === "open" ? "Close thread" : "Reopen thread"}
                  </button>
                  <button
                    type="button"
                    onClick={deleteThread}
                    disabled={deleting}
                    className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                  >
                    {deleting ? "Deleting..." : "Delete thread"}
                  </button>
                </div>
              </div>

              <div className="max-h-[420px] space-y-4 overflow-y-auto pr-1">
                {messages.map((message) => {
                  const isOwn = message.senderUid === firebaseUser?.uid;

                  return (
                    <div
                      key={message.id}
                      className={[
                        "rounded-[22px] border p-4",
                        isOwn
                          ? "border-[#bfdbfe] bg-[#eff6ff]/70"
                          : "border-slate-100 bg-slate-50/80",
                      ].join(" ")}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-950">
                          {message.senderName || getRoleLabel(message.senderRole)}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          {getRoleLabel(message.senderRole)}
                        </span>
                        <span className="text-xs uppercase tracking-[0.16em] text-slate-400">
                          {formatThreadTimestamp(message.createdAt)}
                        </span>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                        {message.body}
                      </p>
                    </div>
                  );
                })}
              </div>

              <CollapsiblePanel
                title="Reply"
                description={
                  selectedThread.status === "closed"
                    ? "Reopen the thread to send a reply."
                    : "Keep replies short and specific."
                }
                defaultOpen
              >
                <Field label="Message">
                  <textarea
                    rows={5}
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    disabled={selectedThread.status === "closed"}
                    placeholder={
                      selectedThread.status === "closed"
                        ? "Reopen the thread to reply."
                        : "Write your reply..."
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#93c5fd] focus:ring-4 focus:ring-[#dbeafe] disabled:bg-slate-50"
                  />
                </Field>

                <button
                  type="button"
                  onClick={sendReply}
                  disabled={sending || selectedThread.status === "closed"}
                  className="mt-4 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  {sending ? "Sending..." : "Send reply"}
                </button>
              </CollapsiblePanel>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function HeaderPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 shadow-sm">
      {label}: <span className="text-slate-900">{value}</span>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-slate-700">{label}</label>
      {children}
    </div>
  );
}
