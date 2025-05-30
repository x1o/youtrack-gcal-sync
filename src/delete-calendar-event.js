const entities = require('@jetbrains/youtrack-scripting-api/entities');
const http = require('@jetbrains/youtrack-scripting-api/http');
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
    // Note: This triggers during actual removal (not just marking for deletion)
    return issue.becomesRemoved && eventId;
  },
  action: async (ctx) => {
    const issue = ctx.issue;
    const eventId = issue.fields['Calendar Event ID'];
    
    try {
      console.log('Deleting calendar event for removed issue:', issue.id, '-', issue.summary);
      console.log('Calendar event ID to delete:', eventId);
      
      // Verify we have an event ID (field access might be limited during removal)
      if (!eventId) {
        console.warn('No Calendar Event ID found during removal - field might not be accessible');
        return;
      }
      
      // Delete calendar event using the wrapper
      const result = calendarHelpers.callGoogleCalendarAPI(ctx, 'DELETE', encodeURIComponent(eventId));
      
      console.log('Calendar event deleted successfully. Status:', result.status);
      
      // Note: We don't need to clear the Calendar Event ID field since the issue is being deleted
      
    } catch (error) {
      console.error(`Failed to delete calendar event for issue ${issue.id}:`, error.message);
      console.warn('Calendar event deletion failed, but issue deletion will proceed');
      // Don't throw - let the issue deletion complete
    }
  },
  requirements: {
    'Calendar Event ID': {
      type: entities.Field.stringType,
      name: 'Calendar Event ID'
    }
  }
});
