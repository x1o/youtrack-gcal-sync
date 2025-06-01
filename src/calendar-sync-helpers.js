const http = require('@jetbrains/youtrack-scripting-api/http');

// Note: YouTrack period fields return ISO 8601 duration format
// User input → ISO format examples:
// "30m" → "PT30M"
// "2h" → "PT2H"
// "3d" → "P3D"
// "1w" → "P1W"
// "1w 2d" → "P1W2D"
// "2d 3h 30m" → "P2DT3H30M"

// Helper function to get a specific user's calendar ID
function getUserCalendarId(user) {
  const calendarId = user.extensionProperties.googleCalendarId;
  
  if (!calendarId) {
    throw new Error(`Google Calendar ID not configured for user ${user.login}. They need to set their calendar ID in the Google Calendar Setup widget.`);
  }
  
  return calendarId;
}

// Helper function to build query strings
function buildQueryString(params) {
  return Object.keys(params)
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');
}

// Function to exchange authorization code for tokens (used by the app)
function exchangeCodeForTokensWithCredentials(authCode, clientId, clientSecret) {
  const connection = new http.Connection('https://oauth2.googleapis.com');
  connection.addHeader('Content-Type', 'application/x-www-form-urlencoded');

  const params = buildQueryString({
    code: authCode,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: 'urn:ietf:wg:oauth:2.0:oob',
    grant_type: 'authorization_code'
  });

  try {
    const tokenResponse = connection.postSync('/token', {}, params);
    const tokens = JSON.parse(tokenResponse.response);
    return tokens;
  } catch (error) {
    if (error.response) {
      console.error('Error response:', error.response);
    }
    throw error;
  }
}

// Internal function to refresh access token for a specific user
function refreshAccessTokenForUser(ctx, user) {
  const settings = ctx.settings;

  // Check if we have required settings
  if (!settings.clientId || !settings.clientSecret) {
    throw new Error('OAuth client credentials not configured in app settings');
  }

  // Check if user has a refresh token
  if (!user.extensionProperties.googleRefreshToken) {
    throw new Error(`User ${user.login} has not authorized Google Calendar access`);
  }

  // Check if current access token is still valid
  const tokenExpiry = user.extensionProperties.googleTokenExpiry || 0;
  if (user.extensionProperties.googleAccessToken && Date.now() < tokenExpiry) {
    return user.extensionProperties.googleAccessToken;
  }

  // Refresh the token
  console.log('Refreshing access token for user:', user.login);

  const connection = new http.Connection('https://oauth2.googleapis.com');
  connection.addHeader('Content-Type', 'application/x-www-form-urlencoded');

  const refreshParams = buildQueryString({
    refresh_token: user.extensionProperties.googleRefreshToken,
    client_id: settings.clientId,
    client_secret: settings.clientSecret,
    grant_type: 'refresh_token'
  });

  try {
    const refreshResponse = connection.postSync('/token', {}, refreshParams);
    const refreshData = JSON.parse(refreshResponse.response);

    // Update user properties
    user.extensionProperties.googleAccessToken = refreshData.access_token;
    user.extensionProperties.googleTokenExpiry = Date.now() + (refreshData.expires_in * 1000);

    console.log('Access token refreshed successfully for user:', user.login);
    return refreshData.access_token;
  } catch (error) {
    console.error('Failed to refresh access token:', error.toString());
    throw error;
  }
}

// Wrapper function for Google Calendar API calls
// Handles token refresh, connection setup, error handling, and response parsing
function callGoogleCalendarAPI(ctx, user, method, endpoint, body = null, returnFullResponse = false) {
  let accessToken;
  let calendarId;
  
  try {
    // Get user's calendar ID
    calendarId = getUserCalendarId(user);
    console.log(`Using calendar ID for user ${user.login}:`, calendarId);
    
    // Refresh access token if needed
    accessToken = refreshAccessTokenForUser(ctx, user);
  } catch (error) {
    console.error('Failed to prepare API call:', error.toString());
    throw new Error(`API call preparation failed: ${error.message}`);
  }
  
  // Create connection
  const connection = new http.Connection('https://www.googleapis.com');
  connection.addHeader('Authorization', 'Bearer ' + accessToken);
  
  if (body !== null) {
    connection.addHeader('Content-Type', 'application/json');
  }
  
  let response;
  try {
    // Make the API call based on method
    const fullUrl = `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events${endpoint ? '/' + endpoint : ''}`;
    
    switch (method.toUpperCase()) {
      case 'GET':
        response = connection.getSync(fullUrl, {});
        break;
      case 'POST':
        response = connection.postSync(fullUrl, {}, body ? JSON.stringify(body) : '');
        break;
      case 'PUT':
        response = connection.putSync(fullUrl, {}, body ? JSON.stringify(body) : '');
        break;
      case 'PATCH':
        response = connection.patchSync(fullUrl, {}, body ? JSON.stringify(body) : '');
        break;
      case 'DELETE':
        response = connection.deleteSync(fullUrl, {});
        break;
      default:
        throw new Error(`Unsupported HTTP method: ${method}`);
    }
    
    // Handle different response types
    if (method.toUpperCase() === 'DELETE') {
      // DELETE typically returns 204 No Content
      return { success: true, status: response.status };
    }
    
    // Parse JSON response
    if (response.response) {
      try {
        const parsedResponse = JSON.parse(response.response);
        if (returnFullResponse) {
          return {
            data: parsedResponse,
            status: response.status,
            headers: response.headers
          };
        }
        return parsedResponse;
      } catch (parseError) {
        console.error('Failed to parse Google Calendar API response:', response.response);
        throw new Error('Invalid response from Google Calendar API');
      }
    }
    
    return null;
    
  } catch (error) {
    // Enhanced error logging
    console.error(`Google Calendar API ${method} request failed:`, error.toString());
    if (error.response) {
      console.error('Error response:', typeof error.response === 'object' ? JSON.stringify(error.response) : error.response);
    }
    
    // Re-throw with more context
    throw new Error(`Google Calendar API error: ${error.message || error.toString()}`);
  }
}

// Helper function to parse period fields (duration and remind before)
// Supports full ISO 8601 period format: P[n]W[n]DT[n]H[n]M[n]S
// Examples: P1W (1 week), P3D (3 days), PT2H30M (2.5 hours), P1W2DT3H (1 week, 2 days, 3 hours)
function parsePeriodToMinutes(periodField) {
  if (!periodField) {
    return null;
  }
  
  // Get ISO 8601 string from the period object
  const periodString = periodField.toString();
  
  // Basic validation
  if (!periodString || !periodString.startsWith('P')) {
    console.warn('Invalid period format:', periodString);
    return null;
  }
  
  // Parse ISO 8601 format including weeks, days, hours, minutes, seconds
  // Format: P[n]W[n]DT[n]H[n]M[n]S
  // P = period, W = weeks, D = days, T = time delimiter, H = hours, M = minutes, S = seconds
  // YouTrack examples: "1w" → "P1W", "3d" → "P3D", "2h 30m" → "PT2H30M", "1w 2d 3h" → "P1W2DT3H"
  
  // First, check for weeks and days (before T)
  const dateMatch = periodString.match(/P(?:(\d+)W)?(?:(\d+)D)?/);
  const weeks = dateMatch ? parseInt(dateMatch[1] || 0) : 0;
  const days = dateMatch ? parseInt(dateMatch[2] || 0) : 0;
  
  // Then check for time components (after T)
  let hours = 0, minutes = 0, seconds = 0;
  if (periodString.includes('T')) {
    const timeMatch = periodString.match(/T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    hours = timeMatch ? parseInt(timeMatch[1] || 0) : 0;
    minutes = timeMatch ? parseInt(timeMatch[2] || 0) : 0;
    seconds = timeMatch ? parseInt(timeMatch[3] || 0) : 0;
  }
  
  // Convert everything to minutes
  const totalMinutes = (weeks * 7 * 24 * 60) + (days * 24 * 60) + (hours * 60) + minutes + Math.round(seconds / 60);
  
  if (totalMinutes === 0 && periodString !== 'PT0S' && periodString !== 'P0D') {
    console.warn('Failed to parse period or zero duration:', periodString);
    return null;
  }
  
  // Log the parsed result
  if (weeks || days || hours || minutes || seconds) {
    const parts = [];
    if (weeks) parts.push(`${weeks}w`);
    if (days) parts.push(`${days}d`);
    if (hours) parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}m`);
    if (seconds) parts.push(`${seconds}s`);
    console.log(`Parsed period '${periodString}': ${parts.join(' ')} = ${totalMinutes} minutes`);
  }
  
  return totalMinutes;
}

// Helper function to parse duration
function parseDuration(durationField) {
  if (!durationField) {
    return null;  // Return null when no duration is set
  }
  
  console.log('Duration:', durationField.toString());
  const minutes = parsePeriodToMinutes(durationField);
  return minutes ? minutes * 60 * 1000 : null;  // Convert minutes to milliseconds
}

// Helper function to format reminder time for logging
function formatReminderTime(minutes) {
  if (minutes < 60) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  } else if (minutes < 1440) { // Less than a day
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours} hour${hours !== 1 ? 's' : ''}`;
  } else if (minutes < 10080) { // Less than a week
    const days = Math.floor(minutes / 1440);
    const remainingHours = Math.floor((minutes % 1440) / 60);
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days} day${days !== 1 ? 's' : ''}`;
  } else {
    const weeks = Math.floor(minutes / 10080);
    const remainingDays = Math.floor((minutes % 10080) / 1440);
    return remainingDays > 0 ? `${weeks}w ${remainingDays}d` : `${weeks} week${weeks !== 1 ? 's' : ''}`;
  }
}

// Helper function to prepare event data
function prepareEventData(issue) {
  // Start datetime is required - don't create events for unplanned issues
  if (!issue.fields['Start datetime']) {
    throw new Error('Cannot create calendar event without start datetime - issue is unplanned');
  }
  
  const startDate = new Date(issue.fields['Start datetime']);
  
  // Check if duration is specified
  const durationField = issue.fields.Duration;
  const isAllDay = !durationField;
  
  let event = {
    summary: issue.summary,
    description: `YouTrack Issue: ${issue.id}\n${issue.description || ''}`,
    // Always include these fields to ensure proper event structure
    transparency: 'opaque',
    visibility: 'default',
    status: 'confirmed'
  };
  
  if (isAllDay) {
    console.log('No duration specified, creating all-day event');
    
    // Format date as YYYY-MM-DD for all-day events
    const dateStr = startDate.toISOString().split('T')[0];
    
    // For all-day events, use 'date' instead of 'dateTime'
    event.start = {
      date: dateStr
    };
    event.end = {
      date: dateStr
    };
  } else {
    // Parse duration for timed events
    const durationMs = parseDuration(durationField);
    const durationMinutes = Math.round(durationMs / 60000);
    
    // Warn if duration seems unusually long (more than 1 week)
    if (durationMinutes > 10080) {
      console.warn(`Event duration of ${formatReminderTime(durationMinutes)} is unusually long for a calendar event`);
    }
    
    console.log('Event duration:', formatReminderTime(durationMinutes));
    const endDate = new Date(startDate.getTime() + durationMs);
    
    console.log('Calendar event times - Start:', startDate.toISOString(), 'End:', endDate.toISOString());
    
    // Note: Multi-day timed events will span across days in Google Calendar
    // For example, a 3-day duration starting Monday 2pm will end Thursday 2pm
    
    // For timed events, use 'dateTime' with timezone
    event.start = {
      dateTime: startDate.toISOString(),
      timeZone: 'UTC'
    };
    event.end = {
      dateTime: endDate.toISOString(),
      timeZone: 'UTC'
    };
  }
  
  // Add reminder if "Remind before" field is set
  const remindBeforeField = issue.fields['Remind before'];
  if (remindBeforeField) {
    const reminderMinutes = parsePeriodToMinutes(remindBeforeField);
    if (reminderMinutes) {
      console.log(`Adding reminder: ${formatReminderTime(reminderMinutes)} before event`);
      
      // Google Calendar has some limits on reminder times:
      // - Maximum is typically 40320 minutes (4 weeks)
      // - Minimum is 0 minutes (at event start)
      // - For all-day events, reminders are typically at a specific time of day
      const maxReminderMinutes = 40320; // 4 weeks
      const actualReminderMinutes = Math.min(reminderMinutes, maxReminderMinutes);
      
      if (reminderMinutes > maxReminderMinutes) {
        console.warn(`Reminder time ${formatReminderTime(reminderMinutes)} exceeds Google Calendar maximum of 4 weeks. Setting to 4 weeks.`);
      }
      
      event.reminders = {
        useDefault: false,
        overrides: [
          {
            method: 'popup',  // Can be 'popup' or 'email'
            minutes: actualReminderMinutes
          }
          // You can add multiple reminders by adding more objects here
          // Example: { method: 'email', minutes: actualReminderMinutes + 60 }
        ]
      };
    } else {
      console.log('Failed to parse reminder period - disabling reminders');
      event.reminders = {
        useDefault: false,
        overrides: []
      };
    }
  } else {
    // Explicitly disable default reminders if no reminder is set
    console.log('No reminder set - disabling default reminders');
    event.reminders = {
      useDefault: false,
      overrides: []
    };
  }
  
  return event;
}

// Export all helper functions and constants
exports.getUserCalendarId = getUserCalendarId;
exports.buildQueryString = buildQueryString;
exports.exchangeCodeForTokensWithCredentials = exchangeCodeForTokensWithCredentials;
exports.refreshAccessTokenForUser = refreshAccessTokenForUser;
exports.callGoogleCalendarAPI = callGoogleCalendarAPI;
exports.parseDuration = parseDuration;
exports.parsePeriodToMinutes = parsePeriodToMinutes;
exports.formatReminderTime = formatReminderTime;
exports.prepareEventData = prepareEventData;
