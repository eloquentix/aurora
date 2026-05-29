/**
 * calendar.gs — Google Calendar integration
 *
 * Fetches today's events from the user's default calendar.
 * Used in the morning briefing to show the day's schedule
 * and give the AI context for the overall summary.
 */

/**
 * Fetches today's remaining events from the default calendar.
 *
 * @returns {CalendarEvent[]}
 *
 * @typedef {Object} CalendarEvent
 * @property {string}      title
 * @property {string}      startTime   Formatted start time
 * @property {string}      endTime     Formatted end time
 * @property {string|null} location
 * @property {string|null} meetLink    Google Meet URL if present
 * @property {boolean}     isAllDay
 */
function fetchTodayEvents() {
  var now = new Date();
  var endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  try {
    var events = CalendarApp.getDefaultCalendar().getEvents(now, endOfDay);

    return events.map(function(e) {
      return {
        title: e.getTitle(),
        startTime: e.isAllDayEvent() ? 'All day' : formatDate(e.getStartTime()),
        endTime: e.isAllDayEvent() ? '' : formatDate(e.getEndTime()),
        location: e.getLocation() || null,
        meetLink: extractMeetLink(e),
        isAllDay: e.isAllDayEvent(),
      };
    });
  } catch (e) {
    Logger.log('Calendar fetch failed: ' + e.message);
    return [];
  }
}
