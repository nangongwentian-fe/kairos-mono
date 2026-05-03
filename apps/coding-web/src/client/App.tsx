import {
  Confirmation,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRequest,
  ConfirmationTitle,
} from "@/components/ai-elements/confirmation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
  type ToolPart,
} from "@/components/ai-elements/tool";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { createInitialWebUiState } from "@kairos/web-ui";
import type {
  WebUiAssistantTranscriptItem,
  WebUiState,
  WebUiTodoItem,
  WebUiTodoState,
  WebUiToolStatus,
  WebUiToolTranscriptItem,
  WebUiTranscriptItem,
  WebUiUserTranscriptItem,
} from "@kairos/web-ui";
import {
  CheckIcon,
  LoaderCircleIcon,
  PlayIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRequest } from "ahooks";

const LEGACY_SESSION_KEY = "kairos-coding-web-session-id";
const SESSION_STORE_KEY = "kairos-coding-web-session-store";
const ACTIVE_SESSION_KEY = "kairos-coding-web-active-session-id";
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const TRANSCRIPT_AUTO_SCROLL_THRESHOLD = 96;

interface CodingWebApprovalRequest {
  id: string;
  sessionId: string;
  toolCallId: string;
  toolName: string;
  risk: string;
  arguments: unknown;
  preview?: string;
}

type SseEvent =
  | { type: "state"; data: WebUiState }
  | { type: "approval"; data: CodingWebApprovalRequest }
  | { type: "done"; data: { state: WebUiState } }
  | { type: "error"; data: { message: string; state: WebUiState } };

interface ApprovalDecisionPayload {
  sessionId: string;
  approvalId: string;
  decision: "allow" | "deny";
}

interface CodingWebSessionSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

interface CodingWebSessionListResponse {
  sessions: CodingWebSessionSummary[];
}

interface CodingWebCreateSessionResponse {
  session: CodingWebSessionSummary;
}

interface InitialSessionLoad {
  activeSessionId: string;
  sessions: CodingWebSessionSummary[];
  state: WebUiState;
}

export function App() {
  const [activeSessionId, setActiveSessionId] = useState(() =>
    loadActiveSessionId(),
  );
  const [sessions, setSessions] = useState<CodingWebSessionSummary[]>([]);
  const [initialized, setInitialized] = useState(false);
  const sessionId = activeSessionId || sessions[0]?.id || "";
  const activeSession = useMemo(
    () => sessions.find((session) => session.id === sessionId),
    [sessionId, sessions],
  );
  const [state, setState] = useState<WebUiState>(() => createInitialWebUiState());
  const [input, setInput] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [approval, setApproval] = useState<CodingWebApprovalRequest>();
  const [deleteTargetSession, setDeleteTargetSession] =
    useState<CodingWebSessionSummary>();
  const transcriptScrollRef = useRef<HTMLDivElement>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const shouldFollowTranscriptRef = useRef(true);
  const runningRef = useRef(false);
  const initialActiveSessionIdRef = useRef(activeSessionId);
  const initializeSessionsRef = useRef<Promise<InitialSessionLoad> | undefined>(
    undefined,
  );
  const approvalDecisionRef = useRef(false);
  const { loading: sessionLoading, runAsync: sessionStateRequest } = useRequest(
    requestSessionState,
    { manual: true },
  );
  const { loading: sessionListLoading, runAsync: sessionListRequest } = useRequest(
    requestSessions,
    { manual: true },
  );
  const {
    loading: sessionCreateLoading,
    runAsync: sessionCreateRequest,
  } = useRequest(requestCreateSession, { manual: true });
  const {
    loading: sessionDeleteLoading,
    runAsync: sessionDeleteRequest,
  } = useRequest(requestDeleteSession, { manual: true });
  const { loading: approvalBusy, runAsync: approvalDecisionRequest } =
    useRequest(requestApprovalDecision, { manual: true });
  const requestBusy =
    busy ||
    sessionLoading ||
    sessionListLoading ||
    sessionCreateLoading ||
    sessionDeleteLoading ||
    !initialized;
  const runDisabled = requestBusy || !sessionId;
  const sessionActionsDisabled = requestBusy || approvalBusy;

  useEffect(() => {
    if (sessionId) {
      saveActiveSessionId(sessionId);
    }
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;

    initializeSessionsRef.current ??= loadInitialSession({
      activeSessionId: initialActiveSessionIdRef.current,
      createSession: requestCreateSession,
      listSessions: requestSessions,
      loadState: requestSessionState,
    });

    initializeSessionsRef.current
      .then((initialSession) => {
        if (cancelled) {
          return;
        }

        setSessions(initialSession.sessions);
        setActiveSessionId(initialSession.activeSessionId);
        setState(initialSession.state);
        shouldFollowTranscriptRef.current = true;
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setNotice(formatError(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setInitialized(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!shouldFollowTranscriptRef.current) {
      return;
    }

    const scrollElement = transcriptScrollRef.current;
    if (scrollElement) {
      scrollElement.scrollTop = scrollElement.scrollHeight;
      return;
    }
    transcriptEndRef.current?.scrollIntoView({ block: "end" });
  }, [state.items, approval]);

  function handleTranscriptScroll() {
    const scrollElement = transcriptScrollRef.current;
    if (!scrollElement) {
      return;
    }

    const distanceFromBottom =
      scrollElement.scrollHeight -
      scrollElement.scrollTop -
      scrollElement.clientHeight;
    shouldFollowTranscriptRef.current =
      distanceFromBottom <= TRANSCRIPT_AUTO_SCROLL_THRESHOLD;
  }

  async function runPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextInput = input.trim();
    if (runningRef.current) {
      return;
    }
    if (!sessionId) {
      setNotice("Create a session first.");
      return;
    }
    if (!nextInput) {
      setNotice("Enter a task first.");
      return;
    }

    runningRef.current = true;
    setBusy(true);
    shouldFollowTranscriptRef.current = true;
    setNotice("");
    setApproval(undefined);
    setSessions((latest) => updateSessionAfterPrompt(latest, sessionId, nextInput));

    try {
      const response = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: nextInput, sessionId }),
      });

      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({}));
        throw new Error(readError(body, "Run failed."));
      }

      await readSse(response.body, (sseEvent) => {
        if (sseEvent.type === "state") {
          setState(sseEvent.data);
          return;
        }
        if (sseEvent.type === "approval") {
          setApproval(sseEvent.data);
          return;
        }
        if (sseEvent.type === "done") {
          setState(sseEvent.data.state);
          setApproval(undefined);
          return;
        }
        setState(sseEvent.data.state);
        setApproval(undefined);
        setNotice(sseEvent.data.message);
      });
      await refreshSessions(sessionId);
    } catch (error) {
      setNotice(formatError(error));
      await refreshSessions(sessionId).catch(() => undefined);
    } finally {
      runningRef.current = false;
      setBusy(false);
    }
  }

  async function respondToApproval(decision: "allow" | "deny") {
    if (!approval || approvalDecisionRef.current) {
      return;
    }

    const currentApproval = approval;
    approvalDecisionRef.current = true;
    try {
      await approvalDecisionRequest({
        sessionId: currentApproval.sessionId,
        approvalId: currentApproval.id,
        decision,
      });
      setApproval((latest) =>
        latest?.id === currentApproval.id ? undefined : latest,
      );
      setNotice(decision === "allow" ? "Tool approved." : "Tool denied.");
    } catch (error) {
      const message = formatError(error);
      if (message.includes("approval not found")) {
        setApproval((latest) =>
          latest?.id === currentApproval.id ? undefined : latest,
        );
      }
      setNotice(message);
    } finally {
      approvalDecisionRef.current = false;
    }
  }

  async function createSession() {
    if (sessionActionsDisabled) {
      return;
    }

    setNotice("");
    setApproval(undefined);
    try {
      const nextSession = await sessionCreateRequest();
      setSessions((latest) => mergeSession(latest, nextSession));
      setActiveSessionId(nextSession.id);
      setState(createInitialWebUiState());
      shouldFollowTranscriptRef.current = true;
      setInput("");
    } catch (error) {
      setNotice(formatError(error));
    }
  }

  async function switchSession(nextSessionId: string) {
    if (nextSessionId === sessionId || sessionActionsDisabled) {
      return;
    }

    setNotice("");
    setApproval(undefined);
    try {
      const nextState = await sessionStateRequest(nextSessionId);
      setState(nextState);
      shouldFollowTranscriptRef.current = true;
      setInput("");
      setActiveSessionId(nextSessionId);
    } catch (error) {
      setNotice(formatError(error));
    }
  }

  function openDeleteSessionDialog(targetSession: CodingWebSessionSummary) {
    if (sessionActionsDisabled) {
      return;
    }
    setDeleteTargetSession(targetSession);
  }

  async function confirmDeleteSession() {
    const targetSession = deleteTargetSession;
    if (!targetSession || sessionActionsDisabled) {
      return;
    }

    setNotice("");
    setApproval(undefined);
    try {
      await sessionDeleteRequest(targetSession.id);
      const nextSessions = await sessionListRequest();
      if (nextSessions.length === 0) {
        const nextSession = await sessionCreateRequest();
        setSessions([nextSession]);
        setActiveSessionId(nextSession.id);
        setState(createInitialWebUiState());
        setInput("");
        shouldFollowTranscriptRef.current = true;
        setDeleteTargetSession(undefined);
        return;
      }

      setSessions(nextSessions);
      if (
        targetSession.id === sessionId ||
        !nextSessions.some((session) => session.id === sessionId)
      ) {
        const nextSessionId = nextSessions[0].id;
        const nextState = await sessionStateRequest(nextSessionId);
        setActiveSessionId(nextSessionId);
        setState(nextState);
        setInput("");
        shouldFollowTranscriptRef.current = true;
      }
      setDeleteTargetSession(undefined);
    } catch (error) {
      setNotice(formatError(error));
      setDeleteTargetSession(undefined);
    }
  }

  async function refreshSessions(preferredSessionId: string) {
    const nextSessions = await sessionListRequest();
    setSessions(nextSessions);
    if (nextSessions.some((session) => session.id === preferredSessionId)) {
      setActiveSessionId(preferredSessionId);
      return;
    }
    if (nextSessions[0]) {
      setActiveSessionId(nextSessions[0].id);
    }
  }

  return (
    <main className="grid min-h-dvh bg-background text-foreground lg:h-dvh lg:grid-cols-[340px_minmax(0,1fr)] lg:overflow-hidden">
      <aside className="flex min-h-0 flex-col gap-4 border-border border-r bg-card/88 p-5 backdrop-blur lg:h-dvh lg:overflow-y-auto">
        <header className="flex items-center gap-3 border-border border-b pb-4">
          <div className="grid size-10 place-items-center rounded-md bg-foreground font-bold text-background">
            K
          </div>
          <div className="min-w-0">
            <h1 className="font-semibold text-lg leading-tight">Kairos Coding</h1>
            <p className="text-muted-foreground text-sm">browser approval UI</p>
          </div>
        </header>

        <SessionPanel
          activeSessionId={sessionId}
          disabled={sessionActionsDisabled}
          loading={sessionLoading}
          onCreate={createSession}
          onDelete={openDeleteSessionDialog}
          onSelect={switchSession}
          sessions={sessions}
        />
        <StatusPanel state={state} />
        <TodoPanel todos={state.todos} />
      </aside>

      <section className="grid min-h-[70dvh] min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] lg:h-dvh lg:min-h-0 lg:overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 border-border border-b bg-background/90 px-5 py-4 backdrop-blur">
          <div className="min-w-0">
            <p className="text-muted-foreground text-sm">workspace</p>
            <h2 className="break-words font-semibold text-xl">Coding Web</h2>
          </div>
        </header>

        <div
          className="min-h-0 overflow-x-hidden overflow-y-auto px-5 py-5"
          onScroll={handleTranscriptScroll}
          ref={transcriptScrollRef}
        >
          <Transcript items={state.items} />
          {approval && (
            <ApprovalPanel
              approval={approval}
              busy={approvalBusy}
              onDecision={respondToApproval}
            />
          )}
          <div ref={transcriptEndRef} />
        </div>

        <form
          className="grid gap-3 border-border border-t bg-card/88 px-5 py-4"
          onSubmit={runPrompt}
        >
          {notice && (
            <Alert>
              <AlertDescription className="break-words">{notice}</AlertDescription>
            </Alert>
          )}
          <textarea
            className="min-h-24 resize-y rounded-md border border-input bg-background px-3 py-3 text-sm outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            disabled={runDisabled}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask Kairos to inspect, edit, or explain this workspace..."
            value={input}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 text-muted-foreground text-sm">
              <span className="break-words">{activeSession?.title ?? "Session"}</span>{" "}
              <span className="font-mono">{sessionId}</span>
            </p>
            <Button disabled={runDisabled} type="submit">
              {busy ? <LoaderCircleIcon className="animate-spin" /> : <PlayIcon />}
              {busy ? "Running" : "Run"}
            </Button>
          </div>
        </form>
      </section>
      <DeleteSessionDialog
        busy={sessionDeleteLoading}
        onCancel={() => setDeleteTargetSession(undefined)}
        onConfirm={confirmDeleteSession}
        session={deleteTargetSession}
      />
    </main>
  );
}

async function requestSessionState(sessionId: string): Promise<WebUiState> {
  const response = await fetch(
    `/api/session?sessionId=${encodeURIComponent(sessionId)}`,
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(readError(body, "Session load failed."));
  }

  return (body as { state: WebUiState }).state;
}

async function loadInitialSession({
  activeSessionId,
  createSession,
  listSessions,
  loadState,
}: {
  activeSessionId: string;
  createSession: () => Promise<CodingWebSessionSummary>;
  listSessions: () => Promise<CodingWebSessionSummary[]>;
  loadState: (sessionId: string) => Promise<WebUiState>;
}): Promise<InitialSessionLoad> {
  const loadedSessions = await listSessions();
  const preferredSessionId = chooseActiveSessionId(
    loadedSessions,
    activeSessionId,
  );
  const initialSessionId = preferredSessionId ?? (await createSession()).id;
  const sessions = preferredSessionId ? loadedSessions : await listSessions();
  const state = await loadState(initialSessionId);

  return {
    activeSessionId: initialSessionId,
    sessions,
    state,
  };
}

async function requestSessions(): Promise<CodingWebSessionSummary[]> {
  const response = await fetch("/api/sessions");
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(readError(body, "Session list failed."));
  }

  return (body as CodingWebSessionListResponse).sessions ?? [];
}

async function requestCreateSession(): Promise<CodingWebSessionSummary> {
  const response = await fetch("/api/sessions", { method: "POST" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(readError(body, "Session create failed."));
  }

  return (body as CodingWebCreateSessionResponse).session;
}

async function requestDeleteSession(sessionId: string): Promise<void> {
  const response = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}`,
    { method: "DELETE" },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(readError(body, "Session delete failed."));
  }
}

async function requestApprovalDecision({
  sessionId,
  approvalId,
  decision,
}: ApprovalDecisionPayload): Promise<void> {
  const response = await fetch("/api/approval", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId,
      approvalId,
      decision,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(readError(body, "Approval failed."));
  }
}

function SessionPanel({
  activeSessionId,
  disabled,
  loading,
  onCreate,
  onDelete,
  onSelect,
  sessions,
}: {
  activeSessionId: string;
  disabled: boolean;
  loading: boolean;
  onCreate: () => void;
  onDelete: (session: CodingWebSessionSummary) => void;
  onSelect: (sessionId: string) => void;
  sessions: readonly CodingWebSessionSummary[];
}) {
  return (
    <section className="min-h-0 overflow-hidden rounded-md border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-border border-b p-3">
        <h2 className="font-medium text-sm">Sessions</h2>
        <Button disabled={disabled} onClick={onCreate} size="xs" type="button">
          <PlusIcon />
          New
        </Button>
      </div>
      <ol className="grid max-h-[28vh] gap-1 overflow-auto p-2">
        {sessions.map((session) => {
          const active = session.id === activeSessionId;
          return (
            <li
              className={`grid grid-cols-[minmax(0,1fr)_auto] items-center overflow-hidden rounded-md transition ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
              key={session.id}
            >
              <button
                className="grid min-w-0 gap-1 px-3 py-2 text-left disabled:cursor-default"
                disabled={disabled || active}
                onClick={() => onSelect(session.id)}
                type="button"
              >
                <span className="truncate font-medium text-sm">{session.title}</span>
                <span
                  className={`truncate text-xs ${
                    active ? "text-primary-foreground/80" : "text-muted-foreground"
                  }`}
                >
                  {loading && active ? "Loading" : formatSessionTime(session.updatedAt)}
                </span>
              </button>
              <Button
                aria-label={`Delete session ${session.title}`}
                className={
                  active
                    ? "mr-2 text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground"
                    : "mr-2 text-muted-foreground"
                }
                disabled={disabled}
                onClick={() => onDelete(session)}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <Trash2Icon />
              </Button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function DeleteSessionDialog({
  busy,
  onCancel,
  onConfirm,
  session,
}: {
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  session?: CodingWebSessionSummary;
}) {
  return (
    <AlertDialog
      onOpenChange={(open) => {
        if (!open && !busy) {
          onCancel();
        }
      }}
      open={Boolean(session)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this session?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the saved session from this workspace. This action cannot
            be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {session && (
          <div className="rounded-md border bg-muted px-3 py-2">
            <p className="truncate font-medium text-sm">{session.title}</p>
            <p className="truncate font-mono text-muted-foreground text-xs">
              {session.id}
            </p>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: "destructive" })}
            disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {busy ? "Deleting" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function StatusPanel({ state }: { state: WebUiState }) {
  return (
    <section className="grid overflow-hidden rounded-md border border-border bg-border">
      <Metric label="status" value={state.status} tone={state.status} />
      <div className="grid grid-cols-2 gap-px">
        <Metric label="turn" value={state.currentTurn ?? "-"} />
        <Metric label="run" value={state.runId} />
      </div>
      <Metric label="stop" value={state.result?.stopReason ?? "-"} />
    </section>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: WebUiState["status"];
}) {
  const toneClass =
    tone === "running"
      ? "text-primary"
      : tone === "failed"
        ? "text-destructive"
        : tone === "completed"
          ? "text-emerald-700"
          : "text-foreground";

  return (
    <div className="min-w-0 bg-card p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <strong className={`block break-words font-semibold text-base ${toneClass}`}>
        {value}
      </strong>
    </div>
  );
}

function TodoPanel({ todos }: { todos?: WebUiTodoState }) {
  return (
    <section className="min-h-0 overflow-hidden rounded-md border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-border border-b p-3">
        <h2 className="font-medium text-sm">Todos</h2>
        <span className="text-muted-foreground text-xs">
          {todos
            ? [todos.pendingCount, todos.inProgressCount, todos.completedCount].join(
                " / ",
              )
            : "0 / 0 / 0"}
        </span>
      </div>
      <ol className="grid max-h-[42vh] gap-2 overflow-auto p-3">
        {todos?.items.length ? (
          todos.items.map((item) => <TodoItem item={item} key={item.id} />)
        ) : (
          <li className="list-none rounded-md border border-dashed p-3 text-muted-foreground text-sm">
            No todos
          </li>
        )}
      </ol>
    </section>
  );
}

function TodoItem({ item }: { item: WebUiTodoItem }) {
  const label = item.status.replace("_", " ");
  const tone =
    item.status === "completed"
      ? "border-l-emerald-600"
      : item.status === "in_progress"
        ? "border-l-primary"
        : "border-l-muted-foreground";

  return (
    <li className={`list-none rounded-md border border-l-4 bg-muted/45 p-3 ${tone}`}>
      <Badge className="mb-2" variant="secondary">
        {label}
      </Badge>
      <p className="break-words text-sm">{item.content}</p>
    </li>
  );
}

function Transcript({ items }: { items: readonly WebUiTranscriptItem[] }) {
  if (items.length === 0) {
    return (
      <div className="grid min-h-[320px] place-items-center rounded-md border border-dashed text-muted-foreground text-sm">
        No messages yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {items.map((item) => (
        <TranscriptItem item={item} key={item.id} />
      ))}
    </div>
  );
}

function TranscriptItem({ item }: { item: WebUiTranscriptItem }) {
  if (item.kind === "user") {
    return <UserMessage item={item} />;
  }
  if (item.kind === "assistant") {
    return <AssistantMessage item={item} />;
  }
  return <ToolMessage item={item} />;
}

function UserMessage({ item }: { item: WebUiUserTranscriptItem }) {
  return (
    <Message from="user">
      <MessageContent>
        <p className="whitespace-pre-wrap break-words">{item.text}</p>
      </MessageContent>
    </Message>
  );
}

function AssistantMessage({ item }: { item: WebUiAssistantTranscriptItem }) {
  return (
    <Message className="max-w-[880px]" from="assistant">
      <MessageContent className="w-full rounded-md border border-border bg-card p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
          <span>{item.streaming ? "Kairos streaming" : "Kairos"}</span>
          <span>turn {item.turn}</span>
          {item.stopReason && <span>{item.stopReason}</span>}
        </div>
        <div className="kairos-response">
          <MessageResponse>{item.text || ""}</MessageResponse>
        </div>
      </MessageContent>
    </Message>
  );
}

function ToolMessage({ item }: { item: WebUiToolTranscriptItem }) {
  const state = toToolPartState(item.status);

  return (
    <Tool className="max-w-[760px]" defaultOpen={false}>
      <ToolHeader
        state={state}
        title={item.toolCall.name}
        toolName={item.toolCall.name}
        type="dynamic-tool"
      />
      <ToolContent>
        <ToolInput input={item.toolCall.arguments} />
        <ToolOutput
          errorText={item.status === "error" ? item.content : undefined}
          output={item.content}
        />
      </ToolContent>
    </Tool>
  );
}

function ApprovalPanel({
  approval,
  busy,
  onDecision,
}: {
  approval: CodingWebApprovalRequest;
  busy: boolean;
  onDecision: (decision: "allow" | "deny") => void;
}) {
  return (
    <section className="mt-4 max-w-[880px]">
      <Confirmation
        approval={{ id: approval.id }}
        className="border-amber-300 bg-amber-50 text-amber-950"
        state="approval-requested"
      >
        <ConfirmationTitle className="font-medium">
          Tool approval: {approval.toolName}
        </ConfirmationTitle>
        <ConfirmationRequest>
          <div className="grid gap-3">
            <Badge
              className="w-fit border-amber-300 text-amber-900"
              variant="outline"
            >
              {approval.risk}
            </Badge>
            <div className="grid gap-3 md:grid-cols-2">
              <ApprovalCode title="Arguments" value={approval.arguments} />
              <ApprovalCode
                title="Preview"
                value={approval.preview || "(no preview)"}
              />
            </div>
          </div>
        </ConfirmationRequest>
        <ConfirmationActions>
          <ConfirmationAction
            disabled={busy}
            onClick={() => onDecision("deny")}
            variant="outline"
          >
            <XIcon />
            Deny
          </ConfirmationAction>
          <ConfirmationAction
            disabled={busy}
            onClick={() => onDecision("allow")}
          >
            {busy ? <LoaderCircleIcon className="animate-spin" /> : <CheckIcon />}
            Allow once
          </ConfirmationAction>
        </ConfirmationActions>
      </Confirmation>
    </section>
  );
}

function ApprovalCode({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-muted-foreground text-xs">{title}</p>
      <pre className="max-h-56 overflow-auto rounded-md border bg-background p-3 font-mono text-xs whitespace-pre-wrap break-words">
        {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function toToolPartState(status: WebUiToolStatus): ToolPart["state"] {
  switch (status) {
    case "pending":
      return "input-streaming";
    case "running":
      return "input-available";
    case "completed":
      return "output-available";
    case "error":
      return "output-error";
  }
}

async function readSse(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: SseEvent) => void,
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const raw = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const event = parseSseEvent(raw);
      if (event) {
        onEvent(event);
      }
      boundary = buffer.indexOf("\n\n");
    }
  }
}

function parseSseEvent(raw: string): SseEvent | undefined {
  const lines = raw.split("\n");
  const eventLine = lines.find((line) => line.startsWith("event: "));
  const dataLines = lines
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice("data: ".length));

  if (!eventLine || dataLines.length === 0) {
    return undefined;
  }

  return {
    type: eventLine.slice("event: ".length),
    data: JSON.parse(dataLines.join("\n")),
  } as SseEvent;
}

function loadActiveSessionId(): string {
  const activeSessionId = localStorage.getItem(ACTIVE_SESSION_KEY);
  if (isSessionId(activeSessionId)) {
    return activeSessionId;
  }

  const legacySessionId = localStorage.getItem(LEGACY_SESSION_KEY);
  if (isSessionId(legacySessionId)) {
    return legacySessionId;
  }

  return readLegacyActiveSessionId() ?? "";
}

function readLegacyActiveSessionId(): string | undefined {
  try {
    const raw = localStorage.getItem(SESSION_STORE_KEY);
    if (!raw) {
      return undefined;
    }

    const value = JSON.parse(raw) as unknown;
    return isRecord(value) && isSessionId(value.activeSessionId)
      ? value.activeSessionId
      : undefined;
  } catch {
    return undefined;
  }
}

function saveActiveSessionId(sessionId: string) {
  localStorage.setItem(ACTIVE_SESSION_KEY, sessionId);
  localStorage.setItem(LEGACY_SESSION_KEY, sessionId);
}

function chooseActiveSessionId(
  sessions: readonly CodingWebSessionSummary[],
  preferredSessionId: string,
): string | undefined {
  if (
    preferredSessionId &&
    sessions.some((session) => session.id === preferredSessionId)
  ) {
    return preferredSessionId;
  }

  return sessions[0]?.id;
}

function mergeSession(
  sessions: readonly CodingWebSessionSummary[],
  nextSession: CodingWebSessionSummary,
): CodingWebSessionSummary[] {
  return [
    nextSession,
    ...sessions.filter((session) => session.id !== nextSession.id),
  ];
}

function updateSessionAfterPrompt(
  sessions: readonly CodingWebSessionSummary[],
  sessionId: string,
  input: string,
): CodingWebSessionSummary[] {
  return sessions.map((session) =>
    session.id === sessionId
      ? {
          ...session,
          title: shouldReplaceSessionTitle(session.title)
            ? createSessionTitle(input)
            : session.title,
          updatedAt: new Date().toISOString(),
        }
      : session,
  );
}

function shouldReplaceSessionTitle(title: string): boolean {
  return /^Session \d+$/.test(title) || title === "Session";
}

function createSessionTitle(input: string): string {
  const normalized = input.replace(/\s+/g, " ").trim();
  return normalized.length > 42 ? `${normalized.slice(0, 39)}...` : normalized;
}

function isSessionId(value: unknown): value is string {
  return typeof value === "string" && SESSION_ID_PATTERN.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatSessionTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function readError(value: unknown, fallback: string) {
  if (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "string"
  ) {
    return value.error;
  }
  return fallback;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
