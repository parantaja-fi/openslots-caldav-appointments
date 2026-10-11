// One calendar as the service account sees it, for 3.6: name, time zone
// and level from a metadata-only events.list, the owner from
// calendars.get — two reads in parallel. Network failure becomes blind,
// as in probes.ts.

import type { CalendarProbe } from "./steps";
import { LEVELS } from "./steps";

const CALENDARS = "https://www.googleapis.com/calendar/v3/calendars";

/** Both reads' fields, and Google's error in any of its three shapes
 * (plan §10, surprise 6). */
interface GoogleBody {
  summary?: string;
  timeZone?: string;
  accessRole?: string;
  dataOwner?: string;
  error?: {
    code?: number;
    message?: string;
    errors?: { reason?: string }[];
    details?: { "@type"?: string; reason?: string; metadata?: { activationUrl?: string } }[];
  };
}

type Failure = Exclude<CalendarProbe, { state: "present" }>;
type Answer = { state: "answer"; body: GoogleBody } | Failure;

// Least first: of two failures, the worse one is the calendar's.
const WORSE: Failure["state"][] = ["blind", "absent", "disabled"];

async function ask(url: string, token: string): Promise<Answer> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  } catch {
    return {
      state: "blind",
      reason: "Google could not be reached — no network, or Google is down.",
    };
  }
  const body = (await res.json().catch(() => null)) as GoogleBody | null;
  if (res.ok && body) return { state: "answer", body };
  const error = body?.error;
  const info = error?.details?.find(
    (d) => d["@type"] === "type.googleapis.com/google.rpc.ErrorInfo",
  );
  const reason = info?.reason ?? error?.errors?.[0]?.reason;
  if (error?.code === 404) return { state: "absent" };
  if (error?.code === 403 && (reason === "SERVICE_DISABLED" || reason === "accessNotConfigured")) {
    return { state: "disabled", activationUrl: info?.metadata?.activationUrl ?? "" };
  }
  return {
    state: "blind",
    reason: error?.message
      ? `Google answered ${res.status} — “${error.message}”`
      : `Google answered ${res.status} — the wizard cannot see the calendar right now.`,
  };
}

export async function probeCalendar(token: string, calendarId: string): Promise<CalendarProbe> {
  const calendar = `${CALENDARS}/${encodeURIComponent(calendarId)}`;
  const [events, owner] = await Promise.all([
    ask(`${calendar}/events?maxResults=1&fields=summary,timeZone,accessRole`, token),
    ask(`${calendar}?fields=dataOwner`, token),
  ]);
  if (events.state !== "answer" || owner.state !== "answer") {
    return [events, owner]
      .filter((a): a is Failure => a.state !== "answer")
      .reduce((a, b) => (WORSE.indexOf(b.state) > WORSE.indexOf(a.state) ? b : a));
  }
  const { summary = "", timeZone = "", accessRole: role } = events.body;
  if (role === "none") return { state: "absent" };
  const accessRole = LEVELS.find((level) => level === role);
  if (!accessRole) {
    return {
      state: "blind",
      reason: `Google reports the access level “${role}”, which the wizard does not know.`,
    };
  }
  return {
    state: "present",
    summary,
    timeZone,
    accessRole,
    // A main calendar has no dataOwner: its ID is its owner.
    owner: owner.body.dataOwner ?? calendarId,
  };
}
