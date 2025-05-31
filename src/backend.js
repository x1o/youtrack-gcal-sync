const calendarHelpers = require('./calendar-sync-helpers');
const http = require('@jetbrains/youtrack-scripting-api/http');

exports.httpHandler = {
  endpoints: [
    {
      method: 'GET',
      path: 'oauth/url',
      handle: function handle(ctx) {
        try {
          const clientId = ctx.settings.clientId;
          if (!clientId) {
            ctx.response.json({ error: 'OAuth client ID not configured in app settings' }, 400);
            return;
          }

          const redirectUri = 'urn:ietf:wg:oauth:2.0:oob';
          const scopes = 'https://www.googleapis.com/auth/calendar';

          const params = calendarHelpers.buildQueryString({
            client_id: clientId,
            redirect_uri: redirectUri,
            scope: scopes,
            response_type: 'code',
            access_type: 'offline',
            prompt: 'consent'
          });

          const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
          console.log('Generated OAuth authorization URL for client:', clientId);
          ctx.response.json({ authUrl });
        } catch (error) {
          console.error('Failed to build OAuth URL:', error.toString());
          ctx.response.json({ error: 'Failed to generate authorization URL' }, 500);
        }
      }
    },
    {
      method: 'POST',
      path: 'oauth/token',
      handle: async function handle(ctx) {
        try {
          const code = await ctx.request.json().code;
          if (!code) {
            ctx.response.json({ error: 'Authorization code is required' }, 400);
            return;
          }

          const user = await ctx.currentUser;

          const clientId = ctx.settings.clientId;
          const clientSecret = ctx.settings.clientSecret;

          if (!clientId || !clientSecret) {
            ctx.response.json({ error: 'OAuth credentials not configured in app settings' }, 400);
            return;
          }

          // Exchange code for tokens using modified helper
          console.log(`Exchanging authorization code for tokens for user: ${user.login}`);
          const response = await calendarHelpers.exchangeCodeForTokensWithCredentials(
            code,
            clientId,
            clientSecret
          );

          if ("error" in response) {
            console.error('OAuth token exchange failed:', response.error, '-', response.error_description);
            ctx.response.json({error: response.error_description || 'Authorization failed'}, 400);
            return;
          }

          // Store tokens in user extension properties
          user.extensionProperties.googleRefreshToken = response.refresh_token;
          user.extensionProperties.googleAccessToken = response.access_token;
          user.extensionProperties.googleTokenExpiry = Date.now() + (response.expires_in * 1000);

          console.log(`OAuth authorization completed successfully for user: ${user.login}`);
          ctx.response.json({ success: true });
        } catch (error) {
          console.error('Failed to complete OAuth token exchange:', error.toString());
          ctx.response.json({ error: 'Failed to complete authorization. Please try again.' }, 500);
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
      path: 'calendar/id',
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
      method: 'GET',
      path: 'calendar/list',
      handle: async function handle(ctx) {
        try {
          const user = await ctx.currentUser;
          
          // Check if user has authorized Google Calendar
          if (!user.extensionProperties.googleRefreshToken) {
            ctx.response.json({ error: 'Please authorize Google Calendar access first' }, 401);
            return;
          }
          
          // Get access token
          let accessToken;
          try {
            accessToken = calendarHelpers.refreshAccessTokenForUser(ctx, user);
          } catch (error) {
            console.error('Failed to get access token:', error.toString());
            ctx.response.json({ error: 'Failed to authenticate with Google Calendar' }, 401);
            return;
          }
          
          // List calendars
          const connection = new http.Connection('https://www.googleapis.com');
          connection.addHeader('Authorization', 'Bearer ' + accessToken);
          
          try {
            const response = connection.getSync('/calendar/v3/users/me/calendarList', {});
            const calendarList = JSON.parse(response.response);
            
            // Extract relevant information
            const calendars = calendarList.items.map(cal => ({
              id: cal.id,
              summary: cal.summary,
              primary: cal.primary || false,
              accessRole: cal.accessRole
            }));
            
            console.log(`Retrieved ${calendars.length} calendars for user ${user.login}`);
            ctx.response.json({ calendars });
            
          } catch (error) {
            console.error('Failed to list calendars:', error.toString());
            ctx.response.json({ error: 'Failed to retrieve calendar list' }, 500);
          }
          
        } catch (error) {
          console.error('Failed to list calendars:', error.toString());
          ctx.response.json({ error: 'An error occurred while listing calendars' }, 500);
        }
      }
    }
  ]
};
