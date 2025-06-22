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

      // Check if assignee has Apps Script configured
      if (!assignee.extensionProperties.googleAppsScriptUrl || !assignee.extensionProperties.googleAppsScriptApiKey) {
        console.warn(`Assignee ${assignee.login} has no Apps Script configured`);
        return;
      }

      if (!assignee.extensionProperties.googleCalendarId) {
        console.warn(`Assignee ${assignee.login} has no calendar ID configured`);
        return;
      }

      // Case 1: Start datetime is added to unplanned issue - create event
      if (issue.isChanged('Start datetime') && issue.fields['Start datetime'] && !eventId) {
        console.log('Start datetime added to unplanned issue - creating calendar event');

        try {
          const eventData = calendarHelpers.prepareEventData(issue);

          console.log('Creating calendar event:', JSON.stringify(eventData));
          console.log('Event type:', eventData.isAllDay ? 'All-day' : 'Timed');

          const result = calendarHelpers.callAppsScriptAPI(assignee, 'create', {
            calendarId: assignee.extensionProperties.googleCalendarId,
            eventData: eventData
          });

          console.log('Calendar event created:', result.eventId);
          issue.fields['Calendar Event ID'] = result.eventId;
        } catch (error) {
          console.error('Failed to create calendar event:', error.message);
        }

        return;
      }

      // Case 2: Start datetime is removed - delete event
      if (issue.isChanged('Start datetime') && !issue.fields['Start datetime'] && eventId) {
        console.log('Start datetime removed - deleting calendar event (issue is now unplanned)');

        try {
          calendarHelpers.callAppsScriptAPI(assignee, 'delete', {
            eventId: eventId,
            calendarId: assignee.extensionProperties.googleCalendarId
          });
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
          calendarHelpers.callAppsScriptAPI(assignee, 'delete', {
            eventId: eventId,
            calendarId: assignee.extensionProperties.googleCalendarId
          });
          console.log('Existing event deleted');

          // Clear the event ID temporarily
          issue.fields['Calendar Event ID'] = null;

          // Create a new event with the correct type
          const eventData = calendarHelpers.prepareEventData(issue);

          console.log('Creating new event with type:', eventData.isAllDay ? 'All-day' : 'Timed');
          console.log('New event data:', JSON.stringify(eventData));

          // Create the new event
          const result = calendarHelpers.callAppsScriptAPI(assignee, 'create', {
            calendarId: assignee.extensionProperties.googleCalendarId,
            eventData: eventData
          });

          console.log('New calendar event created:', result.eventId);

          // Save the new event ID
          issue.fields['Calendar Event ID'] = result.eventId;
          console.log('Calendar event type switch completed successfully');

        } catch (error) {
          console.error('Failed to switch event type:', error.message);
          // Try to restore the original event ID if something went wrong
          issue.fields['Calendar Event ID'] = eventId;
          throw error;
        }

        return;
      }

      // For non-type-switching updates, update via Apps Script
      const updateData = {};
      let hasUpdates = false;

      // Handle time/duration changes (without type switch)
      if (issue.isChanged('Start datetime') || (durationChanged && !switchingEventType)) {
        console.log('Time/duration changed - updating dates');

        // Prepare full event data
        const eventData = calendarHelpers.prepareEventData(issue);
        if (eventData.isAllDay) {
          updateData.startDate = eventData.startDate;
        } else {
          updateData.startDateTime = eventData.startDateTime;
          updateData.endDateTime = eventData.endDateTime;
        }
        hasUpdates = true;

        console.log('Event type:', eventData.isAllDay ? 'All-day' : 'Timed');
      }

      // Handle reminder changes
      if (issue.isChanged('Remind before')) {
        console.log('Reminder changed - updating reminders');

        // Prepare full event data to extract reminders
        const eventData = calendarHelpers.prepareEventData(issue);
        updateData.reminderMinutes = eventData.reminderMinutes;
        hasUpdates = true;

        console.log('Reminder:', eventData.reminderMinutes > 0 
          ? calendarHelpers.formatReminderTime(eventData.reminderMinutes) + ' before' 
          : 'None');
      }

      // Handle summary changes
      if (issue.isChanged('summary')) {
        const oldSummary = issue.oldValue('summary');
        console.log('Title change:', oldSummary ? `"${oldSummary}" → "${issue.summary}"` : `New title: "${issue.summary}"`);
        updateData.summary = issue.summary;
        hasUpdates = true;
      }

      // Handle description changes (resolution status affects description)
      if (issue.becomesResolved || issue.becomesUnresolved || issue.isChanged('description')) {
        updateData.description = `YouTrack Issue: ${issue.id}\n${issue.description || ''}`;
        hasUpdates = true;
        
        if (issue.becomesResolved || issue.becomesUnresolved) {
          const isResolving = issue.becomesResolved;
          console.log(`Issue is becoming ${isResolving ? 'resolved' : 'unresolved'}`);
          console.log('Current state:', issue.fields.State ? issue.fields.State.name : 'Unknown');
          
          // Set event color based on resolution status
          // Color IDs: 1: Lavender, 2: Sage, 3: Grape, 4: Flamingo, 5: Banana, 6: Tangerine
          // 7: Peacock, 8: Graphite, 9: Blueberry, 10: Basil, 11: Tomato, null: Default
          updateData.colorId = isResolving ? '2' : null; // Sage for resolved, default for unresolved
          console.log(`Setting event color to: ${isResolving ? 'Sage (2)' : 'Default (null)'}`);
        }
      }

      if (hasUpdates) {
        console.log('Updating calendar event:', eventId);
        console.log('Update data:', JSON.stringify(updateData));

        // Update calendar event via Apps Script
        const result = calendarHelpers.callAppsScriptAPI(assignee, 'update', {
          eventId: eventId,
          eventData: updateData,
          calendarId: assignee.extensionProperties.googleCalendarId
        });

        console.log('Calendar event updated successfully');
      } else {
        console.log('No calendar updates needed');
      }

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
