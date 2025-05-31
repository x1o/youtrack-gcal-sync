const entities = require('@jetbrains/youtrack-scripting-api/entities');
const calendarHelpers = require('./calendar-sync-helpers');

exports.rule = entities.Issue.onChange({
  title: 'Update calendar event color based on resolution status',
  guard: (ctx) => {
    const issue = ctx.issue;
    const eventId = issue.fields['Calendar Event ID'];
    const assignee = issue.fields.Assignee;
    
    // Only update if there's already a calendar event and an assignee
    if (!eventId || !assignee) return false;
    
    console.log('Color update guard - Event ID:', eventId, 
      'Assignee:', assignee.login,
      'Becomes resolved:', issue.becomesResolved, 
      'Becomes unresolved:', issue.becomesUnresolved);
    
    // Update color when issue becomes resolved or unresolved
    return issue.becomesResolved || issue.becomesUnresolved;
  },
  action: async (ctx) => {
    const issue = ctx.issue;
    const eventId = issue.fields['Calendar Event ID'];
    const assignee = issue.fields.Assignee;
    
    try {
      const isResolving = issue.becomesResolved;
      console.log(`Issue ${issue.id} is becoming ${isResolving ? 'resolved' : 'unresolved'}`);
      console.log('Current state:', issue.fields.State ? issue.fields.State.name : 'Unknown');
      console.log('Updating for assignee:', assignee.login);
      
      // Check if assignee has calendar configured
      if (!assignee.extensionProperties.googleCalendarId || !assignee.extensionProperties.googleRefreshToken) {
        console.warn(`Assignee ${assignee.login} has no calendar configured`);
        return;
      }
      
      // Google Calendar color IDs:
      // 1: Lavender, 2: Sage, 3: Grape, 4: Flamingo, 5: Banana, 6: Tangerine
      // 7: Peacock, 8: Graphite, 9: Blueberry, 10: Basil, 11: Tomato
      // null: Default calendar color
      
      // Set color based on resolution status
      const colorUpdate = {
        colorId: isResolving ? '2' : null  // Sage for resolved, null for unresolved
      };
      
      console.log(`Setting calendar event color to: ${isResolving ? 'Sage (2)' : 'default (null)'}`);
      
      // Update calendar event color using the wrapper (PATCH for partial update)
      const updatedEvent = calendarHelpers.callGoogleCalendarAPI(
        ctx, 
        assignee,
        'PATCH', 
        encodeURIComponent(eventId), 
        colorUpdate
      );
      
      console.log('Calendar event color updated successfully');
      
    } catch (error) {
      console.error(`Failed to update calendar event color for assignee ${assignee.login} on issue ${issue.id}:`, error.message);
      console.warn('Calendar color update failed, but issue state change was saved');
      // Don't throw - let the issue state change complete
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
