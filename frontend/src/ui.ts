/** The element the page's own markup guarantees is there. */
export function element<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

/** An appointment as the customer reads it, in their browser's own locale. */
export function when(start: string, end: string): string {
  const from = new Date(start).toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const to = new Date(end).toLocaleTimeString(undefined, {
    hour: "2-digit", minute: "2-digit",
  });
  return `${from} – ${to}`;
}
