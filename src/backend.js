const calendarHelpers = require('./calendar-sync-helpers');

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

          // Check if refresh token is already saved and stop
          // see https://groups.google.com/g/adwords-api/c/Ra6ZUUw-E_Y
          // if (user.extensionProperties.googleRefreshToken) {
            // console.warn(`User ${user.login} already has a refresh token, preventing overwrite`);
            // ctx.response.json({ 
              // error: 'You have already authorized Google Calendar. To re-authorize, please contact your administrator.' 
            // }, 400);
            // return;
          // }

          const clientId = ctx.settings.clientId;
          const clientSecret = ctx.settings.clientSecret;

          if (!clientId || !clientSecret) {
            ctx.response.json({ error: 'OAuth credentials not configured in app settings' }, 400);
            return;
          }

          // ctx.response.json({
            // code: code,
            // clientId: clientId,
            // clientSecret: clientSecret
          // });
          // return;

          // Exchange code for tokens using modified helper
          console.log(`Exchanging authorization code for tokens for user: ${user.login}`);
          const response = await calendarHelpers.exchangeCodeForTokensWithCredentials(
            code,
            clientId,
            clientSecret
          );

          // ctx.response.json({ response: response });
          // return;

          if ("error" in response) {
            console.error('OAuth token exchange failed:', response.error, '-', response.error_description);
            ctx.response.json({error: response.error_description || 'Authorization failed'}, 400);
            return;
          }

          // if ("error" in response) {
            // if (response.error == 'invalid_grant') {
                // msg = 'Already registered; see https://groups.google.com/g/adwords-api/c/Ra6ZUUw-E_Y'
            // } else {
                // msg = tokens.error_description
            // }
            // ctx.response.json({error: msg}, 500);
            // return;
          // }

          // Store tokens in user extension properties
          user.extensionProperties.googleRefreshToken = response.refresh_token;
          user.extensionProperties.googleAccessToken = response.access_token;
          user.extensionProperties.googleTokenExpiry = Date.now() + (response.expires_in * 1000);

          console.log(`OAuth authorization completed successfully for user: ${user.login}`);
          ctx.response.json({ success: true });
        } catch (error) {
          console.error('Failed to complete OAuth token exchange:', error.toString());
          // ctx.response.json({ error: 'Failed to complete authorization. Please try again.' }, 500);
        }
      }
    }
  ]
};
