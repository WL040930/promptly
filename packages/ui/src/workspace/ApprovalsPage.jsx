import { useEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowUpRight,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileText,
  History,
  Inbox,
  Search,
  ShieldCheck,
  UserRound,
  Workflow,
  X,
  XCircle,
} from "lucide-react";
import { apiRequest } from "../api/client.js";
import { getQuery } from "../utils/router.js";
import { useToast } from "../context/ToastContext.jsx";
import ConfirmModal from "../components/modals/ConfirmModal.jsx";
import Button from "../components/ui/Button.jsx";

gsap.registerPlugin(useGSAP);

const formatDate = (value) =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Unknown time";
const formatRelative = (value) => {
  if (!value) return "Unknown";
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(delta / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

const statusMeta = (status) =>
  ({
    pending: { label: "Needs decision", tone: "amber", Icon: Clock3 },
    resolving: { label: "Applying decision", tone: "indigo", Icon: Clock3 },
    approved: { label: "Approved", tone: "emerald", Icon: CheckCircle2 },
    rejected: { label: "Rejected", tone: "rose", Icon: XCircle },
    expired: { label: "Expired", tone: "slate", Icon: Clock3 },
    failed: { label: "Resume failed", tone: "rose", Icon: AlertCircle },
    discarded: { label: "Discarded", tone: "slate", Icon: AlertCircle },
  })[status] || {
    label: status || "Unknown",
    tone: "slate",
    Icon: AlertCircle,
  };

const toneClasses = {
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rose: "bg-rose-50 text-rose-700 border-rose-200",
  slate: "bg-slate-50 text-slate-600 border-slate-200",
};

const INSPECTOR_TRANSITION_MS = 300;

function StatusBadge({ status }) {
  const meta = statusMeta(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-medium ${toneClasses[meta.tone]}`}
    >
      <meta.Icon className="h-3.5 w-3.5" />
      {meta.label}
    </span>
  );
}

function ApprovalFilters({
  search,
  workflowFilter,
  workflows,
  tab,
  onSearch,
  onWorkflow,
  onTab,
  onClear,
}) {
  const hasFilters = Boolean(search || workflowFilter !== "all");
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search approvals</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search approvals, workflows, or instructions…"
            className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-800 outline-none transition-colors focus:border-indigo-400"
          />
        </label>
        <label className="flex min-w-0 items-center gap-2 lg:w-64">
          <span className="sr-only">Filter by workflow</span>
          <div className="relative min-w-0 flex-1">
            <select
              value={workflowFilter}
              onChange={(event) => onWorkflow(event.target.value)}
              className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-3 pr-9 text-sm font-medium text-slate-700 outline-none focus:border-indigo-400"
            >
              <option value="all">All workflows</option>
              {workflows.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          </div>
        </label>
        {hasFilters && (
          <button
            type="button"
            onClick={onClear}
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Clear
          </button>
        )}
      </div>
      <div
        className="flex flex-wrap items-center gap-1.5"
        role="tablist"
        aria-label="Approval status"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "pending"}
          onClick={() => onTab("pending")}
          className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${tab === "pending" ? "border-slate-900 bg-slate-900 text-white shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
        >
          <Inbox className="mr-1.5 inline h-4 w-4" />
          Pending
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "history"}
          onClick={() => onTab("history")}
          className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${tab === "history" ? "border-slate-900 bg-slate-900 text-white shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
        >
          <History className="mr-1.5 inline h-4 w-4" />
          History
        </button>
      </div>
    </div>
  );
}

function ApprovalList({ approvals, selectedId, tab, onSelect }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {approvals.map((item) => (
        <button
          type="button"
          key={item.id}
          onClick={() => onSelect(item.id)}
          aria-pressed={selectedId === item.id}
          className={`w-full border-t border-slate-100 border-l-4 p-4 text-left transition first:border-t-0 hover:bg-slate-50 ${selectedId === item.id ? "border-l-indigo-600 bg-indigo-50/40" : "border-l-transparent"}`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="truncate text-sm font-semibold text-slate-900 sm:text-base">
                  {item.approval?.title ||
                    item.payload?.title ||
                    "Review required"}
                </span>
                <StatusBadge status={item.status} />
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
                <span>{item.workflow?.name || "Unknown workflow"}</span>
                <span aria-hidden="true">|</span>
                <span>
                  {item.approval?.instructions ||
                    item.payload?.instructions ||
                    "Review the workflow request."}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-400">
                <span>{item.run?.trigger || "Workflow event"}</span>
                <span aria-hidden="true">|</span>
                <span>{formatDate(item.createdAt)}</span>
                <span aria-hidden="true">|</span>
                <span className="font-mono">{item.id}</span>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5 text-right">
              <span className="text-xs font-medium text-slate-800">
                {item.expiresAt
                  ? `Expires ${formatRelative(item.expiresAt)}`
                  : "No expiry"}
              </span>
              {tab === "pending" && (
                <span className="text-xs text-slate-400">
                  {item.approval?.assignee === "external_approver"
                    ? "External approver"
                    : "Automation owner"}
                </span>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

function ReviewEntries({ item }) {
  const entries = item.reviewData?.entries || [];
  if (entries.length === 0)
    return (
      <p className="text-sm text-slate-500">
        No submitted details were attached to this request.
      </p>
    );
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2.5"
        >
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
            {entry.label}
          </p>
          <p className="mt-1 break-words text-sm leading-5 text-slate-800">
            {typeof entry.value === "object"
              ? JSON.stringify(entry.value)
              : String(entry.value || "—")}
          </p>
        </div>
      ))}
    </div>
  );
}

function ApprovalInspector({
  item,
  tokenMode,
  isOpen = true,
  onClose,
  onDecision,
}) {
  return (
    <div
      className={`shrink-0 overflow-hidden transition-[width] duration-300 ease-out motion-reduce:transition-none ${isOpen ? "w-full lg:w-[420px]" : "w-0"}`}
    >
      <aside
        className={`w-full lg:w-[420px] h-full flex flex-col border-l border-slate-200 bg-white shadow-2xl transform transition-transform duration-300 ease-out will-change-transform motion-reduce:transition-none ${isOpen ? "translate-x-0" : "translate-x-full"}`}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50/70 p-4">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 sm:text-base">
              Approval details
            </h3>
            <span className="block max-w-64 truncate font-mono text-xs text-slate-500">
              {item.id}
            </span>
          </div>
          {!tokenMode && (
            <button
              type="button"
              onClick={onClose}
              title="Close inspector"
              aria-label="Close inspector"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
            >
              <X className="h-[18px] w-[18px]" />
            </button>
          )}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="flex flex-col gap-6">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={item.status} />
                {item.reviewData?.kind === "form_submission" && (
                  <span className="rounded border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                    Form submission
                  </span>
                )}
              </div>
              <h4 className="mt-3 text-lg font-bold text-slate-900">
                {item.approval?.title ||
                  item.payload?.title ||
                  "Review required"}
              </h4>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {item.approval?.instructions ||
                  item.payload?.instructions ||
                  "Review this workflow request and choose an outcome."}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs sm:text-sm">
              <Detail
                icon={Workflow}
                label="Workflow"
                value={item.workflow?.name || "Unknown workflow"}
              />
              <Detail
                icon={Clock3}
                label="Received"
                value={formatDate(item.createdAt)}
              />
              <Detail
                icon={CalendarClock}
                label="Expires"
                value={
                  item.expiresAt ? formatDate(item.expiresAt) : "No expiry"
                }
              />
              <Detail
                icon={UserRound}
                label="Assigned to"
                value={
                  item.approval?.assignee === "external_approver"
                    ? item.assigneeEmail || "External approver"
                    : "Automation owner"
                }
              />
              <Detail
                icon={ShieldCheck}
                label="Run"
                value={`${item.run?.trigger || "Workflow event"} · ${item.run?.status || "Waiting"}`}
              />
            </div>
            <div>
              <div className="mb-3 flex items-center gap-2">
                <FileText className="h-4 w-4 text-indigo-500" />
                <span className="text-xs font-semibold text-slate-500">
                  Review data
                </span>
              </div>
              <ReviewEntries item={item} />
            </div>
            <details className="rounded-2xl border border-slate-200 bg-slate-50">
              <summary className="cursor-pointer px-3 py-3 text-xs font-semibold text-slate-600">
                Show technical input
              </summary>
              <pre className="max-h-64 overflow-auto border-t border-slate-200 px-3 py-3 text-[11px] leading-5 text-slate-600">
                {JSON.stringify(item.payload?.input || {}, null, 2)}
              </pre>
            </details>
            {item.status !== "pending" && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                Decision recorded{" "}
                {item.decision?.resolvedAt
                  ? formatDate(item.decision.resolvedAt)
                  : "previously"}
                {item.decision?.resolvedByEmail
                  ? ` by ${item.decision.resolvedByEmail}`
                  : ""}
                {item.decision?.note ? ` — ${item.decision.note}` : ""}
              </div>
            )}
          </div>
        </div>
        {item.status === "pending" && (
          <footer className="flex shrink-0 gap-3 overflow-hidden border-t border-slate-200 bg-white p-3 sm:p-4">
            <Button
              variant="outline"
              iconLeft={<XCircle className="h-4 w-4" />}
              className="min-w-0 flex-1 border-rose-200 px-3 text-rose-700 hover:bg-rose-50"
              onClick={() => onDecision("rejected")}
            >
              Reject
            </Button>
            <Button
              variant="primary"
              iconLeft={<CheckCircle2 className="h-4 w-4" />}
              className="min-w-0 flex-1 px-3"
              onClick={() => onDecision("approved")}
            >
              Approve
            </Button>
          </footer>
        )}
      </aside>
    </div>
  );
}

function Detail({ icon: Icon, label, value }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
        <Icon className="h-3.5 w-3.5 text-slate-400" />
        {label}
      </span>
      <span className="truncate text-xs font-semibold text-slate-800 sm:text-sm">
        {value}
      </span>
    </div>
  );
}

function ApprovalSkeleton() {
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      {[1, 2, 3].map((item) => (
        <div
          key={item}
          className="animate-pulse border-b border-slate-100 pb-4 last:border-0"
        >
          <div className="h-4 w-2/3 rounded bg-slate-200" />
          <div className="mt-3 h-3 w-1/2 rounded bg-slate-100" />
          <div className="mt-3 h-3 w-1/3 rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

export default function ApprovalsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [tokenValue] = useState(() => getQuery().get("token"));
  const tokenMode = Boolean(tokenValue);
  const [tab, setTab] = useState("pending");
  const [selectedId, setSelectedId] = useState(null);
  const [searchInput, setSearchInput] = useState("");
  const [workflowFilter, setWorkflowFilter] = useState("all");
  const [decisionModal, setDecisionModal] = useState(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [isResolving, setIsResolving] = useState(false);
  const [resolvedTokenDetail, setResolvedTokenDetail] = useState(null);
  const [inspectorId, setInspectorId] = useState(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const inspectorOpenFrame = useRef(null);
  const containerRef = useRef(null);

  useGSAP(
    () => {
      gsap.from(containerRef.current, {
        opacity: 0,
        y: 15,
        duration: 0.3,
        ease: "power2.out",
      });
    },
    { scope: containerRef },
  );

  const tokenQuery = useQuery({
    queryKey: ["approval-token", tokenValue],
    enabled: tokenMode,
    queryFn: () =>
      apiRequest(
        `/api/continuations/approvals/token/${encodeURIComponent(tokenValue)}`,
      ),
  });
  const listQuery = useQuery({
    queryKey: ["approvals", tab],
    enabled: !tokenMode,
    queryFn: () => apiRequest(`/api/continuations/approvals?status=${tab}`),
  });
  const rawApprovals = tokenMode
    ? resolvedTokenDetail
      ? [resolvedTokenDetail]
      : tokenQuery.data
        ? [tokenQuery.data]
        : []
    : Array.isArray(listQuery.data)
      ? listQuery.data
      : listQuery.data?.items || [];
  const search = searchInput.trim().toLowerCase();
  const approvals = useMemo(
    () =>
      rawApprovals.filter((item) => {
        const haystack =
          `${item.approval?.title || item.payload?.title || ""} ${item.approval?.instructions || item.payload?.instructions || ""} ${item.workflow?.name || ""}`.toLowerCase();
        return (
          (!search || haystack.includes(search)) &&
          (workflowFilter === "all" || item.workflow?.id === workflowFilter)
        );
      }),
    [rawApprovals, search, workflowFilter],
  );
  const workflows = useMemo(
    () =>
      Array.from(
        new Map(
          rawApprovals.map((item) => [
            item.workflow?.id,
            item.workflow?.name || "Automation",
          ]),
        ).entries(),
      ).filter(([id]) => id),
    [rawApprovals],
  );
  const inspectorItem = tokenMode
    ? approvals[0]
    : approvals.find((item) => item.id === inspectorId) || null;
  const isLoading = tokenMode ? tokenQuery.isPending : listQuery.isPending;
  const isError = tokenMode ? tokenQuery.isError : listQuery.isError;

  useEffect(
    () => () => {
      if (inspectorOpenFrame.current !== null)
        window.cancelAnimationFrame(inspectorOpenFrame.current);
    },
    [],
  );

  useEffect(() => {
    if (tokenMode && inspectorItem) setIsInspectorOpen(true);
  }, [tokenMode, inspectorItem]);

  useEffect(() => {
    if (isInspectorOpen || !inspectorId) return undefined;
    const timer = window.setTimeout(
      () => setInspectorId(null),
      INSPECTOR_TRANSITION_MS,
    );
    return () => window.clearTimeout(timer);
  }, [inspectorId, isInspectorOpen]);

  const openInspector = (id) => {
    setSelectedId(id);
    if (inspectorId) {
      setInspectorId(id);
      setIsInspectorOpen(true);
      return;
    }
    setInspectorId(id);
    inspectorOpenFrame.current = window.requestAnimationFrame(() => {
      inspectorOpenFrame.current = null;
      setIsInspectorOpen(true);
    });
  };

  const closeInspector = () => {
    if (inspectorOpenFrame.current !== null) {
      window.cancelAnimationFrame(inspectorOpenFrame.current);
      inspectorOpenFrame.current = null;
    }
    setSelectedId(null);
    setIsInspectorOpen(false);
  };

  const clearFilters = () => {
    setSearchInput("");
    setWorkflowFilter("all");
    closeInspector();
  };
  const openDecision = (decision) => {
    if (!inspectorItem || inspectorItem.status !== "pending") return;
    setDecisionNote("");
    setDecisionModal({ decision, item: inspectorItem });
  };
  const resolve = async () => {
    if (!decisionModal?.item) return;
    setIsResolving(true);
    const { item, decision } = decisionModal;
    try {
      const path = tokenMode
        ? `/api/continuations/approvals/${encodeURIComponent(tokenValue)}/resolve`
        : `/api/continuations/approvals/id/${encodeURIComponent(item.id)}/resolve`;
      const result = await apiRequest(path, {
        method: "POST",
        body: JSON.stringify({
          decision,
          note: decisionNote.trim() || undefined,
        }),
      });
      toast.success(
        decision === "approved"
          ? "Approval recorded. The approved branch is continuing."
          : "Rejection recorded. The rejected branch is continuing.",
      );
      setDecisionModal(null);
      if (tokenMode) {
        setResolvedTokenDetail(result.continuation);
        window.history.replaceState({}, "", "/app/approvals");
      } else {
        await queryClient.invalidateQueries({ queryKey: ["approvals"] });
        closeInspector();
      }
    } catch (error) {
      toast.error(error.message || "This approval could not be resolved.");
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className="tab-content surface-grid flex h-full min-h-0 flex-1 overflow-hidden font-sans"
    >
      <div
        className="min-w-0 flex-1 overflow-y-auto p-5 md:p-8"
      >
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
          <div>
            <p className="eyebrow">Decision history</p>
            <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-slate-900">
              Approvals
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Review workflow requests, understand the context, and decide which
              branch continues.
            </p>
          </div>
          {!tokenMode && (
            <ApprovalFilters
              search={searchInput}
              workflowFilter={workflowFilter}
              workflows={workflows}
              tab={tab}
              onSearch={(value) => {
                setSearchInput(value);
                closeInspector();
              }}
              onWorkflow={(value) => {
                setWorkflowFilter(value);
                closeInspector();
              }}
              onTab={(value) => {
                setTab(value);
                closeInspector();
              }}
              onClear={clearFilters}
            />
          )}
          {isLoading ? (
            <ApprovalSkeleton />
          ) : isError ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 p-12 text-center">
              <AlertCircle className="h-8 w-8 text-rose-500" />
              <p className="mt-3 font-semibold text-rose-800">
                Unable to load approvals
              </p>
              <p className="mt-1 text-sm text-rose-700">
                The request may have expired or the service may be unavailable.
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() =>
                  tokenMode ? tokenQuery.refetch() : listQuery.refetch()
                }
              >
                Try again
              </Button>
            </div>
          ) : approvals.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white/70 p-12 text-center">
              <ShieldCheck className="h-9 w-9 text-indigo-300" />
              <p className="mt-4 font-semibold text-slate-700">
                {tokenMode
                  ? "This approval is no longer available"
                  : tab === "pending"
                    ? "No approvals waiting"
                    : "No decisions found"}
              </p>
              <p className="mt-1 text-sm text-slate-400">
                {tokenMode
                  ? "The link may have expired or already been used."
                  : tab === "pending"
                    ? "New approval requests will appear here when a workflow pauses."
                    : "Resolved workflow decisions will appear here."}
              </p>
            </div>
          ) : tokenMode ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">
                Opening approval details…
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                  {approvals.length}{" "}
                  {tab === "pending" ? "waiting" : "past decisions"}
                </p>
                <span className="text-xs text-slate-400">Newest first</span>
              </div>
              <ApprovalList
                approvals={approvals}
                selectedId={selectedId}
                tab={tab}
                onSelect={openInspector}
              />
            </>
          )}
        </div>
      </div>
      {inspectorItem && (
        <ApprovalInspector
          item={inspectorItem}
          tokenMode={tokenMode}
          isOpen={isInspectorOpen}
          onClose={closeInspector}
          onDecision={openDecision}
        />
      )}
      <ConfirmModal
        isOpen={Boolean(decisionModal)}
        onClose={() => !isResolving && setDecisionModal(null)}
        onConfirm={resolve}
        isLoading={isResolving}
        title={
          decisionModal?.decision === "approved"
            ? "Approve this request?"
            : "Reject this request?"
        }
        message={
          decisionModal?.decision === "approved"
            ? "The approved branch will run immediately and the workflow will continue."
            : "The rejected branch will run immediately. This cannot be undone."
        }
        confirmText={
          decisionModal?.decision === "approved"
            ? "Approve request"
            : "Reject request"
        }
        confirmVariant={
          decisionModal?.decision === "approved" ? "primary" : "dangerSolid"
        }
      >
        <label className="block text-left">
          <span className="text-xs font-bold text-slate-700">
            Decision note{" "}
            <span className="font-normal text-slate-400">(optional)</span>
          </span>
          <textarea
            value={decisionNote}
            onChange={(event) => setDecisionNote(event.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="Add context for the next person reviewing this run"
            className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100"
          />
          <span className="mt-1 block text-right text-[10px] text-slate-400">
            {decisionNote.length}/1000
          </span>
        </label>
      </ConfirmModal>
    </div>
  );
}
