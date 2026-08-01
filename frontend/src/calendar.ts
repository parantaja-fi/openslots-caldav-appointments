import { Calendar } from "@fullcalendar/core";
import timeGridPlugin from "@fullcalendar/timegrid";
import { fetchSlots } from "./api";
import type { Slot } from "./types";

export function initCalendar(
  el: HTMLElement,
  onSlotClick: (slot: Slot) => void,
): { calendar: Calendar; refreshSlots: () => Promise<void> } {
  let windowStart = "";
  let windowEnd = "";

  const refreshSlots = async (): Promise<void> => {
    if (!windowStart) return;
    const slots = await fetchSlots(windowStart, windowEnd);
    calendar.removeAllEvents();
    for (const slot of slots) {
      calendar.addEvent({
        id: slot.slot_start,
        title: "Available",
        start: slot.slot_start,
        end: slot.slot_end,
      });
    }
  };

  const calendar = new Calendar(el, {
    plugins: [timeGridPlugin],
    initialView: "timeGridWeek",
    slotDuration: "00:30:00",
    slotMinTime: "07:00:00",
    slotMaxTime: "21:00:00",
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "timeGridWeek,timeGridDay",
    },
    eventColor: "#22c55e",
    datesSet: async info => {
      windowStart = info.startStr;
      windowEnd = info.endStr;
      try {
        await refreshSlots();
      } catch (err) {
        const message = document.createElement("p");
        message.style.cssText = "color:#dc2626;padding:8px;margin:0";
        message.textContent = `Could not load available times: ${String(err)}`;
        el.prepend(message);
      }
    },
    eventClick: info => onSlotClick({
      slot_start: info.event.start?.toISOString() ?? info.event.startStr,
      slot_end: info.event.end?.toISOString() ?? info.event.endStr,
    }),
  });

  calendar.render();
  return { calendar, refreshSlots };
}
