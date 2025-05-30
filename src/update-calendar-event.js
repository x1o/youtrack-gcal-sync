const entities = require('@jetbrains/youtrack-scripting-api/entities');
const http = require('@jetbrains/youtrack-scripting-api/http');
const calendarHelpers = require('./calendar-sync-helpers');

exports.rule = entities.Issue.onChange({
  title: 'Update calendar event when time or reminder changes',
  guard: (ctx) => {
    const issue = ctx.issue;
    const eventId = issue.fields['Calendar Event ID'];
    
    // Only update if there's already a calendar event
    if (!eventId) return false;
    
    // Check if start datetime, duration, or remind before changed
    const startChanged = issue.isChanged('Start datetime');
    const durationChanged = issue.isChanged('Duration');
    const reminderChanged = issue.isChanged('Remind before');
    
    console.log('Update guard - Event ID:', eventId, 
      'Start changed:', startChanged, 
      'Duration changed:', durationChanged,
      'Reminder changed:', reminderChanged);
    
    return startChanged || durationChanged || reminderChanged;
  },
  action: async (ctx) => {
    const issue = ctx.issue;
    const eventId = issue.fields['Calendar Event ID'];
    
    try {
      console.log('Updating calendar event for issue:', issue.id, '-', issue.summary);
      console.log('Changes detected - Start:', issue.isChanged('Start datetime'), 
        'Duration:', issue.isChanged('Duration'),
        'Reminder:', issue.isChanged('Remind before'));
      
      // Prepare updated event data
      const event = calendarHelpers.prepareEventData(issue);
      
      console.log('Updating calendar event:', eventId, 'with:', JSON.stringify(event));
      console.log('Event type:', event.start.date ? 'All-day' : 'Timed');
      console.log('Reminder:', event.reminders.overrides.length > 0 
        ? calendarHelpers.formatReminderTime(event.reminders.overrides[0].minutes) + ' before' 
        : 'None');
      
      // Update calendar event using the wrapper (PUT for full update)
      const updatedEvent = calendarHelpers.callGoogleCalendarAPI(
        ctx, 
        'PUT', 
        encodeURIComponent(eventId), 
        event
      );
      
      console.log('Calendar event updated:', updatedEvent.id);
      
    } catch (error) {
      console.error(`Failed to update calendar event for issue ${issue.id}:`, error.message);
      console.warn('Calendar event update failed, but issue changes were saved');
      // Don't throw - let the issue update complete
    }
  },
  requirements: {
    'Start datetime': {
      type: entities.Field.dateTimeType,
      name: 'Start datetime'
    },
    Duration: {
      type: entities.Field.periodType,
      name: 'Duration'
    },
    'Remind before': {
      type: entities.Field.periodType,
      name: 'Remind before'
    },
    'Calendar Event ID': {
      type: entities.Field.stringType,
      name: 'Calendar Event ID'
    }
  }
});
