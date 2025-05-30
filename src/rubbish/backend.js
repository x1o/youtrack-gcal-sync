const http = require('@jetbrains/youtrack-scripting-api/http');

// Google OAuth constants
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';
const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';

// Helper function to build query string
function buildQueryString(params) {
  return Object.keys(params)
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');
}

exports.httpHandler = {
  endpoints: [
    {
      method: 'GET',
      path: 'auth-status',
      handle: function handle(ctx) {
        const currentUser = ctx.currentUser;
        const userProps = currentUser.extensionProperties;
        const refreshToken = userProps.googleRefreshToken;
        const accessToken = userProps.googleAccessToken;
        const tokenExpiry = userProps.googleTokenExpiry;
        
        const now = Date.now();
        const isAuthenticated = !!refreshToken;
        const hasValidAccessToken = accessToken && tokenExpiry && tokenExpiry > now;
        
        ctx.response.json({
          isAuthenticated: isAuthenticated,
          hasRefreshToken: !!refreshToken,
          hasAccessToken: !!accessToken,
          accessTokenValid: hasValidAccessToken,
          tokenExpiresIn: hasValidAccessToken ? Math.round((tokenExpiry - now) / 1000) : 0
        },
    
    {
      method: 'POST',
      path: 'refresh-token',
      handle: function handle(ctx) {
        try {
          const calendarHelpers = require('./calendar-sync-helpers-app');
          const newToken = calendarHelpers.refreshAccessToken(ctx);
          
          ctx.response.json({
            success: true,
            message: 'Token refreshed successfully',
            expiresAt: new Date(ctx.currentUser.extensionProperties.googleTokenExpiry)
          });
        } catch (error) {
          console.error('Manual token refresh failed:', error);
          ctx.response.json({
            success: false,
            error: error.message
          }, 400);
        }
      }
    });
      }
    },
    
    {
      method: 'GET',
      path: 'auth-url',
      handle: function handle(ctx) {
        const clientId = ctx.settings.clientId;
        
        if (!clientId) {
          ctx.response.json({
            error: 'CLIENT_ID not configured in app settings'
          }, 400);
          return;
        }
        
        const params = {
          client_id: clientId,
          redirect_uri: REDIRECT_URI,
          scope: GOOGLE_CALENDAR_SCOPE,
          response_type: 'code',
          access_type: 'offline',  // Required for refresh token
          prompt: 'consent'         // Forces consent screen to ensure refresh token
        };
        
        const authUrl = `${GOOGLE_AUTH_URL}?${buildQueryString(params)}`;
        
        ctx.response.json({
          authUrl: authUrl
        });
      }
    },
    
    {
      method: 'POST',
      path: 'exchange-code',
      handle: async function handle(ctx) {
        const authCode = ctx.request.json.authCode;
        const clientId = ctx.settings.clientId;
        const clientSecret = ctx.settings.clientSecret;
        
        if (!clientId || !clientSecret) {
          ctx.response.json({
            success: false,
            error: 'CLIENT_ID or CLIENT_SECRET not configured in app settings'
          }, 400);
          return;
        }
        
        if (!authCode) {
          ctx.response.json({
            success: false,
            error: 'Authorization code is required'
          }, 400);
          return;
        }
        
        try {
          // Exchange auth code for tokens
          const connection = new http.Connection(GOOGLE_TOKEN_URL);
          connection.addHeader('Content-Type', 'application/x-www-form-urlencoded');
          
          const params = buildQueryString({
            code: authCode,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: REDIRECT_URI,
            grant_type: 'authorization_code'
          });
          
          const tokenResponse = connection.postSync('', {}, params);
          
          if (tokenResponse.status !== 200) {
            console.error('Token exchange failed:', tokenResponse.response);
            ctx.response.json({
              success: false,
              error: 'Failed to exchange authorization code'
            }, 400);
            return;
          }
          
          const tokens = JSON.parse(tokenResponse.response);
          
          // Validate we got all required tokens
          if (!tokens.refresh_token) {
            // This can happen if the user has already authorized the app before
            // They need to revoke access and re-authorize to get a new refresh token
            console.error('No refresh token returned. User may need to revoke app access and try again.');
            ctx.response.json({
              success: false,
              error: 'No refresh token returned. Please revoke app access in Google settings and try again.'
            }, 400);
            return;
          }
          
          // Save tokens to user properties
          const currentUser = ctx.currentUser;
          currentUser.extensionProperties.googleRefreshToken = tokens.refresh_token;
          currentUser.extensionProperties.googleAccessToken = tokens.access_token;
          currentUser.extensionProperties.googleTokenExpiry = Date.now() + (tokens.expires_in * 1000);
          
          console.log('Successfully saved tokens for user:', currentUser.login);
          console.log('Token expires at:', new Date(currentUser.extensionProperties.googleTokenExpiry));
          
          ctx.response.json({
            success: true,
            message: 'Authentication successful'
          });
          
        } catch (error) {
          console.error('Error exchanging auth code:', error);
          ctx.response.json({
            success: false,
            error: 'Failed to exchange authorization code: ' + error.toString()
          }, 500);
        }
      }
    },
    
    {
      method: 'POST',
      path: 'logout',
      handle: function handle(ctx) {
        const currentUser = ctx.currentUser;
        
        // Clear all Google-related tokens
        currentUser.extensionProperties.googleRefreshToken = null;
        currentUser.extensionProperties.googleAccessToken = null;
        currentUser.extensionProperties.googleTokenExpiry = null;
        
        console.log('Cleared Google tokens for user:', currentUser.login);
        
        ctx.response.json({
          success: true,
          message: 'Logged out successfully'
        });
      }
    }
  ]
};
