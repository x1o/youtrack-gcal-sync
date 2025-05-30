const entities = require('@jetbrains/youtrack-scripting-api/entities');
const http = require('@jetbrains/youtrack-scripting-api/http');
const calendarHelpers = require('./calendar-sync-helpers');

exports.rule = entities.Issue.onChange({
  title: 'Update calendar event title when issue summary changes',
  guard: (ctx) => {
    const issue = ctx.issue;
    const eventId = issue.fields['Calendar Event ID'];
    
    // Only update if there's already a calendar event
    if (!eventId) return false;
    
    // Check if summary changed
    const summaryChanged = issue.isChanged('summary');
    
    console.log('Title update guard - Event ID:', eventId, 'Summary changed:', summaryChanged);
    
    return summaryChanged;
  },
  action: async (ctx) => {
    const issue = ctx.issue;
    const eventId = issue.fields['Calendar Event ID'];
    
    try {
      console.log('Updating calendar event title for issue:', issue.id);
      const oldSummary = issue.oldValue('summary');
      console.log('Title change:', oldSummary ? `"${oldSummary}" → "${issue.summary}"` : `New title: "${issue.summary}"`);
      
      // Update only the title
      const titleUpdate = {
        summary: issue.summary
      };
      
      console.log('Updating calendar event title to:', issue.summary);
      
      // Update calendar event title using the wrapper (PATCH for partial update)
      const updatedEvent = calendarHelpers.callGoogleCalendarAPI(
        ctx, 
        'PATCH', 
        encodeURIComponent(eventId), 
        titleUpdate
      );
      
      console.log('Calendar event title updated successfully');
      
    } catch (error) {
      console.error(`Failed to update calendar event title for issue ${issue.id}:`, error.message);
      console.warn('Calendar title update failed, but issue summary change was saved');
      // Don't throw - let the issue update complete
    }
  },
  requirements: {
    'Calendar Event ID': {
      type: entities.Field.stringType,
      name: 'Calendar Event ID'
    }
  }
});
