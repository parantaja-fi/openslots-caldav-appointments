// Creates the two collections a backend profile names. Radicale will not
// create one on PUT, so a fresh instance — a CI runner's, or a first local run
// — needs this once. An existing collection counts as success: RFC 4791 §5.3.1
// asks for 405 there, radicale answers 409.
//
// Usage: node scripts/mkcalendars.mjs <backend>

import { readFileSync } from "node:fs";
import { parseVars } from "../test/vars.mjs";

const name = process.argv[2];
if (!name) throw new Error("usage: node scripts/mkcalendars.mjs <backend>");

const path = new URL(`../test/backends/${name}.vars`, import.meta.url);
const vars = parseVars(readFileSync(path, "utf8"));

const body = `<?xml version="1.0" encoding="UTF-8"?>
<C:mkcalendar xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:set><D:prop><D:displayname>booking test</D:displayname></D:prop></D:set>
</C:mkcalendar>`;

const credentials = `${vars.TEST_WRITE_USERNAME}:${vars.TEST_WRITE_PASSWORD}`;

for (const role of ["AVAILABILITY_CALENDAR_URL", "BOOKING_STORE_URL"]) {
  const url = vars[role];
  const response = await fetch(url, {
    method: "MKCALENDAR",
    headers: {
      Authorization: `Basic ${Buffer.from(credentials).toString("base64")}`,
      "Content-Type": "application/xml; charset=utf-8",
    },
    body,
  });
  if (![201, 405, 409].includes(response.status)) {
    throw new Error(`MKCALENDAR ${url}: ${response.status} ${await response.text()}`);
  }
  console.log(`${response.status === 201 ? "created" : "exists "}  ${url}`);
}
