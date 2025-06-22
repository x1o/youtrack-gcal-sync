const calendarHelpers = require('./calendar-sync-helpers');
const http = require('@jetbrains/youtrack-scripting-api/http');

exports.httpHandler = {
  endpoints: [
    {
      method: 'GET',
      path: 'appscript/config',
      handle: async function handle(ctx) {
        try {
          const user = await ctx.currentUser;
          
          const config = {
            appsScriptUrl: user.extensionProperties.googleAppsScriptUrl || '',
            hasApiKey: !!user.extensionProperties.googleAppsScriptApiKey,
            calendarId: user.extensionProperties.googleCalendarId || ''
          };

          console.log(`Retrieved Apps Script config for user ${user.login}`);
          ctx.response.json(config);
        } catch (error) {
          console.error('Failed to retrieve Apps Script config:', error.toString());
          ctx.response.json({ error: 'Failed to retrieve configuration' }, 500);
        }
      }
    },
    {
      method: 'POST',
      path: 'appscript/save-config',
      handle: async function handle(ctx) {
        try {
          const { appsScriptUrl, apiKey } = await ctx.request.json();
          const user = await ctx.currentUser;
          
          console.log('Saving Apps Script config for user:', user.login);
          
          if (!appsScriptUrl || !appsScriptUrl.trim()) {
            ctx.response.json({ error: 'Apps Script URL is required' }, 400);
            return;
          }
          
          if (!apiKey || !apiKey.trim()) {
            ctx.response.json({ error: 'API key is required' }, 400);
            return;
          }
          
          // Basic URL validation
          const trimmedUrl = appsScriptUrl.trim();
          if (!trimmedUrl.startsWith('https://script.google.com/macros/')) {
            ctx.response.json({ 
              error: 'Invalid Apps Script URL format. It should start with https://script.google.com/macros/' 
            }, 400);
            return;
          }

          // Save the configuration
          user.extensionProperties.googleAppsScriptUrl = trimmedUrl;
          user.extensionProperties.googleAppsScriptApiKey = apiKey.trim();

          console.log(`Apps Script config saved for user ${user.login}`);
          
          ctx.response.json({ success: true });
        } catch (error) {
          console.error('Failed to save Apps Script config:', error.toString());
          ctx.response.json({ error: 'Failed to save configuration' }, 500);
        }
      }
    },
    {
      method: 'POST',
      path: 'appscript/test',
      handle: async function handle(ctx) {
        try {
          const user = await ctx.currentUser;
          
          // Check if user has configured Apps Script
          if (!user.extensionProperties.googleAppsScriptUrl || !user.extensionProperties.googleAppsScriptApiKey) {
            ctx.response.json({ error: 'Apps Script URL and API key must be configured first' }, 400);
            return;
          }

          // Test connection to Apps Script
          try {
            const testResult = await calendarHelpers.callAppsScriptAPI(user, 'test', {});
            
            console.log(`Apps Script connection test successful for user ${user.login}`);
            ctx.response.json({ 
              success: true, 
              message: 'Connection to Apps Script successful',
              appsScriptResponse: testResult
            });
          } catch (error) {
            console.error('Apps Script connection test failed:', error.toString());
            ctx.response.json({ 
              success: false, 
              error: 'Failed to connect to Apps Script: ' + error.message 
            }, 500);
          }
        } catch (error) {
          console.error('Failed to test Apps Script connection:', error.toString());
          ctx.response.json({ error: 'Failed to test connection' }, 500);
        }
      }
    },
    {
      method: 'GET',
      path: 'calendar/id',
      handle: async function handle(ctx) {
        try {
          const user = await ctx.currentUser;
          const calendarId = user.extensionProperties.googleCalendarId || '';

          console.log(`Retrieved calendar ID for user ${user.login}: ${calendarId || 'not set'}`);
          ctx.response.json({ calendarId });
        } catch (error) {
          console.error('Failed to retrieve calendar ID:', error.toString());
          ctx.response.json({ error: 'Failed to retrieve calendar ID' }, 500);
        }
      }
    },
    {
      method: 'POST',
      path: 'calendar/save-id',
      handle: async function handle(ctx) {
        try {
          const { calendarId } = await ctx.request.json();
          if (!calendarId || !calendarId.trim()) {
            ctx.response.json({ error: 'Calendar ID is required' }, 400);
            return;
          }

          const user = await ctx.currentUser;

          // Basic validation for calendar ID format
          const trimmedId = calendarId.trim();
          if (!trimmedId.includes('@')) {
            ctx.response.json({ 
              error: 'Invalid calendar ID format. It should be an email address or end with @group.calendar.google.com' 
            }, 400);
            return;
          }

          // Save the calendar ID
          user.extensionProperties.googleCalendarId = trimmedId;

          console.log(`Calendar ID saved for user ${user.login}: ${trimmedId}`);
          ctx.response.json({ success: true });
        } catch (error) {
          console.error('Failed to save calendar ID:', error.toString());
          ctx.response.json({ error: 'Failed to save calendar ID' }, 500);
        }
      }
    },
    {
      method: 'POST',
      path: 'calendar/list',
      handle: async function handle(ctx) {
        try {
          const user = await ctx.currentUser;

          // Check if user has configured Apps Script
          if (!user.extensionProperties.googleAppsScriptUrl || !user.extensionProperties.googleAppsScriptApiKey) {
            ctx.response.json({ error: 'Apps Script must be configured first' }, 400);
            return;
          }

          // List calendars via Apps Script
          try {
            const calendars = await calendarHelpers.listUserCalendars(user);
            
            console.log(`Retrieved ${calendars.length} calendars for user ${user.login} via Apps Script`);
            ctx.response.json({ calendars });

          } catch (error) {
            console.error('Failed to list calendars via Apps Script:', error.toString());
            ctx.response.json({ error: 'Failed to retrieve calendar list: ' + error.message }, 500);
          }

        } catch (error) {
          console.error('Failed to list calendars:', error.toString());
          ctx.response.json({ error: 'An error occurred while listing calendars' }, 500);
        }
      }
    }
  ]
};
