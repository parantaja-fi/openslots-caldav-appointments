import { expect, test } from "@playwright/test";
import { clear, devVar, paint, report } from "./caldav";

const availability = devVar("AVAILABILITY_CALENDAR_URL");
const store = devVar("BOOKING_STORE_URL");

// Local noon tomorrow: past the minimum notice, and inside the hours the
// week view shows, so the event is visible without scrolling.
const slotStart = new Date();
slotStart.setDate(slotStart.getDate() + 1);
slotStart.setHours(12, 0, 0, 0);
const slotEnd = new Date(slotStart.getTime() + 30 * 60_000);
const window = { from: new Date(slotStart.getTime() - 3600_000), to: new Date(slotEnd.getTime() + 3600_000) };

async function reset(): Promise<void> {
  await clear(availability, window.from, window.to);
  await clear(store, window.from, window.to);
}

test.beforeEach(async () => {
  await reset();
  await paint(availability, "OPEN", slotStart, slotEnd);
});

test.afterAll(reset);

test("books a painted slot and cancels it again", async ({ page }) => {
  await page.goto("/");

  // The week view starts on Sunday, so tomorrow falls into the next one only
  // when today is Saturday.
  if (new Date().getDay() === 6) await page.click(".fc-next-button");

  const slot = page.locator(".fc-timegrid-event").first();
  await expect(slot).toBeVisible();
  await slot.click();

  await page.fill("#bf-name", "E2E Tester");
  await page.click("#bf-submit");
  await expect(page.locator("#bf-confirmation")).toContainText("E2E Tester");

  const booked = await report(store, window.from, window.to);
  expect(booked.filter(e => e.ics.includes("SUMMARY:E2E Tester"))).toHaveLength(1);

  await page.click("#bf-cancel-booking");
  await expect(page.locator("#booking-panel")).toBeHidden();

  const remaining = await report(store, window.from, window.to);
  expect(remaining.filter(e => e.ics.includes("SUMMARY:E2E Tester"))).toHaveLength(0);
});
