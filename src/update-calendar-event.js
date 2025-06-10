const entities = require('@jetbrains/youtrack-scripting-api/entities');
const calendarHelpers = require('./calendar-sync-helpers');

exports.rule = entities.Issue.onChange({
  title: 'Update calendar event when issue details change (or create/delete based on planning status)',
  guard: (ctx) => {
    const issue = ctx.issue;
    const eventId = issue.fields['Calendar Event ID'];
    const assignee = issue.fields.Assignee;

    // If no assignee, nothing to do
    if (!assignee) return false;

    if (issue.id == "Issue.Draft") {
      return false;
    }

    // Check if any relevant fields changed
    const startChanged = issue.isChanged('Start datetime');
    const durationChanged = issue.isChanged('Estimation');
    const reminderChanged = issue.isChanged('Remind before');
    const summaryChanged = issue.isChanged('summary');
    const resolutionChanged = issue.becomesResolved || issue.becomesUnresolved;

    // Special cases for start datetime changes:
    // 1. If event exists and start datetime is removed → need to delete event
    // 2. If no event exists and start datetime is added → need to create event
    const startBecomingNull = startChanged && !issue.fields['Start datetime'];
    const startBecomingSet = startChanged && issue.fields['Start datetime'] && !eventId;

    console.log('Update guard - Event ID:', eventId || 'none', 
      'Assignee:', assignee.login,
      'Start changed:', startChanged, 
      'Start becoming null:', startBecomingNull,
      'Start becoming set:', startBecomingSet,
      'Estimation changed:', durationChanged,
      'Reminder changed:', reminderChanged,
      'Summary changed:', summaryChanged,
      'Resolution changed:', resolutionChanged);

    // Include cases where we need to create or delete events based on start datetime
    return startChanged || durationChanged || reminderChanged || summaryChanged || resolutionChanged;
  },
  action: async (ctx) => {
    const issue = ctx.issue;
    const eventId = issue.fields['Calendar Event ID'];
    const assignee = issue.fields.Assignee;

    try {
      console.log('Processing calendar update for assignee:', assignee.login, 'Issue:', issue.id, '-', issue.summary);

      // Check if assignee has calendar configured
      if (!assignee.extensionProperties.googleCalendarId || !assignee.extensionProperties.googleRefreshToken) {
        console.warn(`Assignee ${assignee.login} has no calendar configured`);
        return;
      }

      // Case 1: Start datetime is added to unplanned issue - create event
      if (issue.isChanged('Start datetime') && issue.fields['Start datetime'] && !eventId) {
        console.log('Start datetime added to unplanned issue - creating calendar event');

        try {
          const newEventData = calendarHelpers.prepareEventData(issue);

          console.log('Creating calendar event:', JSON.stringify(newEventData));
          console.log('Event type:', newEventData.start.date ? 'All-day' : 'Timed');

          const createdEvent = calendarHelpers.callGoogleCalendarAPI(ctx, assignee, 'POST', '', newEventData);

          console.log('Calendar event created:', createdEvent.id);
          issue.fields['Calendar Event ID'] = createdEvent.id;
        } catch (error) {
          console.error('Failed to create calendar event:', error.message);
        }

        return;
      }

      // Case 2: Start datetime is removed - delete event
      if (issue.isChanged('Start datetime') && !issue.fields['Start datetime'] && eventId) {
        console.log('Start datetime removed - deleting calendar event (issue is now unplanned)');

        try {
          calendarHelpers.callGoogleCalendarAPI(ctx, assignee, 'DELETE', encodeURIComponent(eventId));
          console.log('Calendar event deleted successfully');

          // Clear the event ID
          issue.fields['Calendar Event ID'] = null;
        } catch (error) {
          console.error('Failed to delete calendar event:', error.message);
        }

        return;
      }

      // For all other updates, we need an existing event
      if (!eventId) {
        console.warn('No calendar event to update');
        return;
      }

      console.log('Updating existing calendar event:', eventId);

      // Check if we're switching between all-day and timed event
      const durationChanged = issue.isChanged('Estimation');
      const oldEstimation = issue.oldValue('Estimation');
      const newEstimation = issue.fields.Estimation;
      const switchingEventType = durationChanged && 
        ((oldEstimation === null || oldEstimation === undefined) !== (newEstimation === null || newEstimation === undefined));

      if (switchingEventType) {
        console.log(`Switching event type: ${oldEstimation ? 'Timed' : 'All-day'} → ${newEstimation ? 'Timed' : 'All-day'}`);
        console.log('Event type switch detected - will delete and recreate event');

        try {
          // Delete the existing event
          console.log('Deleting existing event:', eventId);
          calendarHelpers.callGoogleCalendarAPI(ctx, assignee, 'DELETE', encodeURIComponent(eventId));
          console.log('Existing event deleted');

          // Clear the event ID temporarily
          issue.fields['Calendar Event ID'] = null;

          // Create a new event with the correct type
          const newEventData = calendarHelpers.prepareEventData(issue);

          console.log('Creating new event with type:', newEventData.start.date ? 'All-day' : 'Timed');
          console.log('New event data:', JSON.stringify(newEventData));

          // Create the new event
          const newEvent = calendarHelpers.callGoogleCalendarAPI(ctx, assignee, 'POST', '', newEventData);

          console.log('New calendar event created:', newEvent.id);

          // Save the new event ID
          issue.fields['Calendar Event ID'] = newEvent.id;
          console.log('Calendar event type switch completed successfully');

        } catch (error) {
          console.error('Failed to switch event type:', error.message);
          // Try to restore the original event ID if something went wrong
          issue.fields['Calendar Event ID'] = eventId;
          throw error;
        }

        return;
      }

      // For non-type-switching updates, use PATCH
      const patchData = {};

      // Handle time/duration changes (without type switch)
      if (issue.isChanged('Start datetime') || (durationChanged && !switchingEventType)) {
        console.log('Time/duration changed - updating dates');

        // Prepare full event data to extract start/end
        const eventData = calendarHelpers.prepareEventData(issue);
        patchData.start = eventData.start;
        patchData.end = eventData.end;

        console.log('Event type:', eventData.start.date ? 'All-day' : 'Timed');
      }

      // Handle reminder changes
      if (issue.isChanged('Remind before')) {
        console.log('Reminder changed - updating reminders');

        // Prepare full event data to extract reminders
        const eventData = calendarHelpers.prepareEventData(issue);
        patchData.reminders = eventData.reminders;

        console.log('Reminder:', eventData.reminders.overrides.length > 0 
          ? calendarHelpers.formatReminderTime(eventData.reminders.overrides[0].minutes) + ' before' 
          : 'None');
      }

      // Handle summary changes
      if (issue.isChanged('summary')) {
        const oldSummary = issue.oldValue('summary');
        console.log('Title change:', oldSummary ? `"${oldSummary}" → "${issue.summary}"` : `New title: "${issue.summary}"`);
        patchData.summary = issue.summary;
      }

      // Handle resolution status changes
      if (issue.becomesResolved || issue.becomesUnresolved) {
        const isResolving = issue.becomesResolved;
        console.log(`Issue is becoming ${isResolving ? 'resolved' : 'unresolved'}`);
        console.log('Current state:', issue.fields.State ? issue.fields.State.name : 'Unknown');

        // Google Calendar color IDs:
        // 1: Lavender, 2: Sage, 3: Grape, 4: Flamingo, 5: Banana, 6: Tangerine
        // 7: Peacock, 8: Graphite, 9: Blueberry, 10: Basil, 11: Tomato
        // null: Default calendar color

        patchData.colorId = isResolving ? '2' : null;  // Sage for resolved, default for unresolved
        console.log(`Setting calendar event color to: ${isResolving ? 'Sage (2)' : 'default (null)'}`);
      }

      console.log('Updating calendar event with PATCH:', eventId);
      console.log('Update data:', JSON.stringify(patchData));

      // Update calendar event using PATCH for partial update
      const updatedEvent = calendarHelpers.callGoogleCalendarAPI(
        ctx, 
        assignee,
        'PATCH', 
        encodeURIComponent(eventId), 
        patchData
      );

      console.log('Calendar event updated successfully');

    } catch (error) {
      console.error(`Failed to update calendar event for assignee ${assignee.login} on issue ${issue.id}:`, error.message);
      console.warn('Calendar event update failed, but issue changes were saved');
      // Don't throw - let the issue update complete
    }
  },
  requirements: {
    Assignee: {
      type: entities.User.fieldType
    },
    'Start datetime': {
      type: entities.Field.dateTimeType
    },
    Estimation: {
      type: entities.Field.periodType
    },
    'Remind before': {
      type: entities.Field.periodType
    },
    'Calendar Event ID': {
      type: entities.Field.stringType
    }
  }
});
