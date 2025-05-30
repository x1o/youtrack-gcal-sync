const entities = require('@jetbrains/youtrack-scripting-api/entities');
const http = require('@jetbrains/youtrack-scripting-api/http');
const calendarHelpers = require('./calendar-sync-helpers');

exports.rule = entities.Issue.onChange({
  title: 'Create calendar event for new issue',
  guard: (ctx) => {
    const issue = ctx.issue;
    console.log('Create guard - Becomes reported:', issue.becomesReported, 'Calendar Event ID:', issue.fields['Calendar Event ID']);
    // Create calendar event for new issues without an existing event ID
    // No duration required - will create all-day event if duration is not set
    return issue.becomesReported && !issue.fields['Calendar Event ID'];
  },
  action: async (ctx) => {
    const issue = ctx.issue;
    
    try {
      console.log('Creating calendar event for issue:', issue.id, '-', issue.summary);
      
      // Prepare event data
      const event = calendarHelpers.prepareEventData(issue);
      
      console.log('Creating calendar event:', JSON.stringify(event));
      console.log('Event type:', event.start.date ? 'All-day' : 'Timed');
      console.log('Reminder:', event.reminders.overrides.length > 0 
        ? calendarHelpers.formatReminderTime(event.reminders.overrides[0].minutes) + ' before' 
        : 'None');
      
      // Create calendar event using the wrapper
      const createdEvent = calendarHelpers.callGoogleCalendarAPI(ctx, 'POST', '', event);
      
      console.log('Calendar event created:', createdEvent.id);
      
      // Save event ID to issue
      issue.fields['Calendar Event ID'] = createdEvent.id;
      console.log('Event ID saved to issue');
      
    } catch (error) {
      console.error(`Failed to create calendar event for issue ${issue.id}:`, error.message);
      console.warn('Calendar event creation failed, but issue was created successfully');
      // Don't throw - let the issue creation complete
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
