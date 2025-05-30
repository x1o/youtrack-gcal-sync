const entities = require('@jetbrains/youtrack-scripting-api/entities');
const http = require('@jetbrains/youtrack-scripting-api/http');
const calendarHelpers = require('./calendar-sync-helpers-app');

exports.rule = entities.Issue.onChange({
  title: 'Create calendar event for new issue (App version)',
  guard: (ctx) => {
    const issue = ctx.issue;
    // Check if user is authenticated
    const hasToken = !!ctx.currentUser.extensionProperties.googleRefreshToken;
    
    if (!hasToken) {
      console.log('User not authenticated with Google Calendar');
      return false;
    }
    
    console.log('Create guard - Becomes reported:', issue.becomesReported, 'Calendar Event ID:', issue.fields['Calendar Event ID']);
    return issue.becomesReported && !issue.fields['Calendar Event ID'];
  },
  action: async (ctx) => {
    const issue = ctx.issue;
    
    try {
      console.log('Creating calendar event for issue:', issue.id, '-', issue.summary);
      
      // Get access token (will refresh if needed)
      const accessToken = calendarHelpers.getAccessToken(ctx);
      
      // Get user's calendar ID
      const calendarId = calendarHelpers.getCalendarId(ctx);
      
      // Prepare event data (same as before)
      const event = calendarHelpers.prepareEventData(issue);
      
      console.log('Creating calendar event:', JSON.stringify(event));
      
      // Create calendar event
      const calendarConnection = new http.Connection('https://www.googleapis.com');
      calendarConnection.addHeader('Authorization', 'Bearer ' + accessToken);
      calendarConnection.addHeader('Content-Type', 'application/json');
      
      const eventResponse = calendarConnection.postSync(
        `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
        {},
        JSON.stringify(event)
      );
      
      if (eventResponse.status !== 200) {
        console.error('Failed to create calendar event:', eventResponse.response);
        throw new Error('Failed to create calendar event');
      }
      
      const createdEvent = JSON.parse(eventResponse.response);
      console.log('Calendar event created:', createdEvent.id);
      
      // Save event ID to issue
      issue.fields['Calendar Event ID'] = createdEvent.id;
      console.log('Event ID saved to issue');
      
    } catch (error) {
      console.error('Error creating calendar event:', error.toString());
      console.error('Error stack:', error.stack);
      
      // Handle specific error cases
      if (error.message.includes('not authenticated')) {
        issue.addComment('Failed to create calendar event: Please authenticate with Google Calendar in your profile settings.');
      } else if (error.message.includes('re-authenticate')) {
        // Clear invalid tokens
        ctx.currentUser.extensionProperties.googleAccessToken = null;
        ctx.currentUser.extensionProperties.googleTokenExpiry = null;
        issue.addComment('Google Calendar authentication expired. Please re-authenticate in your profile settings.');
      } else {
        issue.addComment(`Failed to create calendar event: ${error.message}`);
      }
      
      // Don't throw error to prevent workflow failure
      // throw error;
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
