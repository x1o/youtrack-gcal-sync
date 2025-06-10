const entities = require('@jetbrains/youtrack-scripting-api/entities');
const calendarHelpers = require('./calendar-sync-helpers');

exports.rule = entities.Issue.onChange({
  title: 'Create calendar events when assignee changes',
  guard: (ctx) => {
    const issue = ctx.issue;

    // Check if this is a new issue with assignee
    const newIssueWithAssignee = issue.becomesReported && issue.fields.Assignee;

    // Only proceed if assignee field changed or new issue with assignee
    if (!issue.isChanged('Assignee') && !newIssueWithAssignee) {
      return false;
    }

    if (issue.id == "Issue.Draft") {
      return false;
    }

    // Always handle assignee changes
    return true;
  },
  action: async (ctx) => {
    const issue = ctx.issue;
    const previousAssignee = issue.oldValue('Assignee');
    const currentAssignee = issue.fields.Assignee;
    const existingEventId = issue.fields['Calendar Event ID'];
    const isNewIssue = issue.becomesReported;

    if (isNewIssue && currentAssignee) {
      console.log(`New issue created with assignee: ${currentAssignee.login}`);
    } else {
      console.log(`Assignee changed from ${previousAssignee?.login || 'unassigned'} to ${currentAssignee?.login || 'unassigned'}`);
    }

    try {
      // Step 1: Delete event from previous assignee's calendar if it exists
      if (previousAssignee && existingEventId) {
        try {
          if (previousAssignee.extensionProperties.googleCalendarId && 
              previousAssignee.extensionProperties.googleRefreshToken) {
            console.log('Deleting event from previous assignee calendar:', previousAssignee.login);
            calendarHelpers.callGoogleCalendarAPI(ctx, previousAssignee, 'DELETE', encodeURIComponent(existingEventId));
            console.log('Event deleted from previous assignee calendar');
          } else {
            console.warn(`Previous assignee ${previousAssignee.login} has no calendar configured`);
          }
        } catch (error) {
          console.warn(`Failed to delete event from previous assignee ${previousAssignee.login}:`, error.message);
          // Continue with next steps even if deletion fails
        }

        // Clear the event ID since we deleted it
        issue.fields['Calendar Event ID'] = null;
      }

      // Step 2: Create event in new assignee's calendar if there is one
      if (currentAssignee) {
        // Check if issue has a start datetime - don't create events for unplanned issues
        if (!issue.fields['Start datetime']) {
          console.log('Issue has no start datetime - skipping calendar event creation (unplanned issue)');
          return;
        }

        // Check if new assignee has calendar configured
        if (!currentAssignee.extensionProperties.googleCalendarId) {
          console.warn(`Assignee ${currentAssignee.login} has not configured their Google Calendar ID`);
          return;
        }

        if (!currentAssignee.extensionProperties.googleRefreshToken) {
          console.warn(`Assignee ${currentAssignee.login} has not authorized Google Calendar access`);
          return;
        }

        console.log('Creating event in assignee calendar:', currentAssignee.login);

        // Prepare event data
        const event = calendarHelpers.prepareEventData(issue);

        console.log('Creating calendar event:', JSON.stringify(event));
        console.log('Event type:', event.start.date ? 'All-day' : 'Timed');
        console.log('Reminder:', event.reminders.overrides.length > 0 
          ? calendarHelpers.formatReminderTime(event.reminders.overrides[0].minutes) + ' before' 
          : 'None');

        // Create calendar event for assignee
        const createdEvent = calendarHelpers.callGoogleCalendarAPI(ctx, currentAssignee, 'POST', '', event);

        console.log('Calendar event created:', createdEvent.id);

        // Save new event ID
        issue.fields['Calendar Event ID'] = createdEvent.id;
        console.log('Event ID saved to issue');
      } else {
        // Issue was unassigned - event already deleted, ID already cleared
        console.log('Issue unassigned - calendar event removed');
      }

    } catch (error) {
      console.error(`Failed to manage calendar events for issue ${issue.id}:`, error.message);
      console.warn('Calendar sync failed during assignee change, but issue update was successful');
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
