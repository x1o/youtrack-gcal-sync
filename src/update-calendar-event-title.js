const entities = require('@jetbrains/youtrack-scripting-api/entities');
const calendarHelpers = require('./calendar-sync-helpers');

exports.rule = entities.Issue.onChange({
  title: 'Update calendar event title when issue summary changes',
  guard: (ctx) => {
    const issue = ctx.issue;
    const eventId = issue.fields['Calendar Event ID'];
    const assignee = issue.fields.Assignee;
    
    // Only update if there's already a calendar event and an assignee
    if (!eventId || !assignee) return false;
    
    // Check if summary changed
    const summaryChanged = issue.isChanged('summary');
    
    console.log('Title update guard - Event ID:', eventId, 
      'Assignee:', assignee.login,
      'Summary changed:', summaryChanged);
    
    return summaryChanged;
  },
  action: async (ctx) => {
    const issue = ctx.issue;
    const eventId = issue.fields['Calendar Event ID'];
    const assignee = issue.fields.Assignee;
    
    try {
      console.log('Updating calendar event title for assignee:', assignee.login, 'Issue:', issue.id);
      const oldSummary = issue.oldValue('summary');
      console.log('Title change:', oldSummary ? `"${oldSummary}" → "${issue.summary}"` : `New title: "${issue.summary}"`);
      
      // Check if assignee has calendar configured
      if (!assignee.extensionProperties.googleCalendarId || !assignee.extensionProperties.googleRefreshToken) {
        console.warn(`Assignee ${assignee.login} has no calendar configured`);
        return;
      }
      
      // Update only the title
      const titleUpdate = {
        summary: issue.summary
      };
      
      console.log('Updating calendar event title to:', issue.summary);
      
      // Update calendar event title using the wrapper (PATCH for partial update)
      const updatedEvent = calendarHelpers.callGoogleCalendarAPI(
        ctx, 
        assignee,
        'PATCH', 
        encodeURIComponent(eventId), 
        titleUpdate
      );
      
      console.log('Calendar event title updated successfully');
      
    } catch (error) {
      console.error(`Failed to update calendar event title for assignee ${assignee.login} on issue ${issue.id}:`, error.message);
      console.warn('Calendar title update failed, but issue summary change was saved');
      // Don't throw - let the issue update complete
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
