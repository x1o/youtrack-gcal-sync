const entities = require('@jetbrains/youtrack-scripting-api/entities');
const calendarHelpers = require('./calendar-sync-helpers');

// IMPORTANT: The runOn.removal property must be set to true for becomesRemoved to work
exports.rule = entities.Issue.onChange({
  title: 'Delete calendar event when issue is deleted',
  runOn: {
    removal: true
  },
  guard: (ctx) => {
    const issue = ctx.issue;
    const eventId = issue.fields['Calendar Event ID'];

    console.log('Delete guard - Becomes removed:', issue.becomesRemoved, 'Calendar Event ID:', eventId);

    // Delete calendar event when issue is removed and has an event ID
    return issue.becomesRemoved && eventId;
  },
  action: async (ctx) => {
    const issue = ctx.issue;
    const eventId = issue.fields['Calendar Event ID'];

    // Get the assignee who owns the calendar event
    const assignee = issue.fields.Assignee;

    if (!assignee) {
      console.warn('No assignee found for calendar event deletion');
      return;
    }

    try {
      console.log('Deleting calendar event for removed issue:', issue.id, '-', issue.summary);
      console.log('From assignee:', assignee.login);
      console.log('Calendar event ID to delete:', eventId);

      // Verify we have an event ID (field access might be limited during removal)
      if (!eventId) {
        console.warn('No Calendar Event ID found during removal - field might not be accessible');
        return;
      }

      // Check if assignee has Apps Script configured
      if (!assignee.extensionProperties.googleAppsScriptUrl || !assignee.extensionProperties.googleAppsScriptApiKey) {
        console.warn(`Assignee ${assignee.login} no longer has Apps Script configured`);
        return;
      }

      // Delete calendar event via Apps Script
      const result = calendarHelpers.callAppsScriptAPI(assignee, 'delete', {
        eventId: eventId,
        calendarId: assignee.extensionProperties.googleCalendarId
      });

      console.log('Calendar event deleted successfully via Apps Script');

      // Note: We don't need to clear the Calendar Event ID field since the issue is being deleted

    } catch (error) {
      console.error(`Failed to delete calendar event for assignee ${assignee.login} on issue ${issue.id}:`, error.message);
      console.warn('Calendar event deletion failed, but issue deletion will proceed');
      // Don't throw - let the issue deletion complete
    }
  },
  requirements: {
    Assignee: {
      type: entities.User.fieldType
    },
    'Calendar Event ID': {
      type: entities.Field.stringType
    }
  }
});
