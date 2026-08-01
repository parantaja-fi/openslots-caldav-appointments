import { WORKER_URL } from "./config";

const el = document.getElementById("calendar");
if (!el) throw new Error("No #calendar element found");

el.textContent = `Worker API: ${WORKER_URL}`;
