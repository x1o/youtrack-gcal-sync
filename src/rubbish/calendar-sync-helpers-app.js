const http = require('@jetbrains/youtrack-scripting-api/http');

// Helper function to build query strings
function buildQueryString(params) {
  return Object.keys(params)
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');
}

// Helper function to get access token (from cache or refresh)
function getAccessToken(ctx) {
  const currentUser = ctx.currentUser;
  const userProps = currentUser.extensionProperties;
  
  // Check if we have a valid cached access token
  const accessToken = userProps.googleAccessToken;
  const tokenExpiry = userProps.googleTokenExpiry;
  
  // Add 5 minute buffer to expiry check to avoid using almost-expired tokens
  const bufferTime = 5 * 60 * 1000; // 5 minutes in milliseconds
  const expiryWithBuffer = Date.now() + bufferTime;
  
  if (accessToken && tokenExpiry && tokenExpiry > expiryWithBuffer) {
    console.log('Using cached access token for user:', currentUser.login);
    return accessToken;
  }
  
  // Token expired or missing, need to refresh
  console.log('Access token expired or missing, refreshing...');
  return refreshAccessToken(ctx);
}

// Helper function to refresh access token using user's refresh token
function refreshAccessToken(ctx) {
  const currentUser = ctx.currentUser;
  const userProps = currentUser.extensionProperties;
  const refreshToken = userProps.googleRefreshToken;
  
  if (!refreshToken) {
    throw new Error('User not authenticated with Google Calendar');
  }
  
  const clientId = ctx.settings.clientId;
  const clientSecret = ctx.settings.clientSecret;
  
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth not configured in app settings');
  }
  
  console.log('Refreshing access token for user:', currentUser.login);
  
  const connection = new http.Connection('https://oauth2.googleapis.com');
  connection.addHeader('Content-Type', 'application/x-www-form-urlencoded');
  
  const refreshParams = buildQueryString({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token'
  });
  
  try {
    const refreshResponse = connection.postSync('/token', {}, refreshParams);
    
    if (refreshResponse.status !== 200) {
      console.error('Token refresh failed:', refreshResponse.response);
      // Clear invalid tokens
      userProps.googleAccessToken = null;
      userProps.googleTokenExpiry = null;
      throw new Error('Failed to refresh access token. User may need to re-authenticate.');
    }
    
    const refreshData = JSON.parse(refreshResponse.response);
    
    // Save the new access token and expiry to user properties
    if (refreshData.access_token) {
      userProps.googleAccessToken = refreshData.access_token;
      userProps.googleTokenExpiry = Date.now() + (refreshData.expires_in * 1000);
      console.log('Access token refreshed successfully, expires at:', new Date(userProps.googleTokenExpiry));
      return refreshData.access_token;
    } else {
      // Some OAuth providers don't return access_token on refresh
      throw new Error('No access token returned during refresh');
    }
  } catch (error) {
    console.error('Error refreshing token:', error);
    throw error;
  }
}

// Get user's calendar ID (with fallback to default)
function getCalendarId(ctx) {
  const calendarId = ctx.currentUser.extensionProperties.googleCalendarId;
  return calendarId || 'primary'; // Use primary calendar if not specified
}

// Parse period fields (duration and remind before)
// Supports full ISO 8601 period format: P[n]W[n]DT[n]H[n]M[n]S
function parsePeriodToMinutes(periodField) {
  if (!periodField) {
    return null;
  }
  
  const periodString = periodField.toString();
  
  if (!periodString || !periodString.startsWith('P')) {
    console.warn('Invalid period format:', periodString);
    return null;
  }
  
  // Parse weeks and days
  const dateMatch = periodString.match(/P(?:(\d+)W)?(?:(\d+)D)?/);
  const weeks = dateMatch ? parseInt(dateMatch[1] || 0) : 0;
  const days = dateMatch ? parseInt(dateMatch[2] || 0) : 0;
  
  // Parse time components
  let hours = 0, minutes = 0, seconds = 0;
  if (periodString.includes('T')) {
    const timeMatch = periodString.match(/T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    hours = timeMatch ? parseInt(timeMatch[1] || 0) : 0;
    minutes = timeMatch ? parseInt(timeMatch[2] || 0) : 0;
    seconds = timeMatch ? parseInt(timeMatch[3] || 0) : 0;
  }
  
  const totalMinutes = (weeks * 7 * 24 * 60) + (days * 24 * 60) + (hours * 60) + minutes + Math.round(seconds / 60);
  
  if (totalMinutes === 0 && periodString !== 'PT0S' && periodString !== 'P0D') {
    console.warn('Failed to parse period or zero duration:', periodString);
    return null;
  }
  
  return totalMinutes;
}

// Parse duration
function parseDuration(durationField) {
  if (!durationField) {
    return null;
  }
  
  console.log('Duration:', durationField.toString());
  const minutes = parsePeriodToMinutes(durationField);
  return minutes ? minutes * 60 * 1000 : null;
}

// Format reminder time for logging
function formatReminderTime(minutes) {
  if (minutes < 60) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  } else if (minutes < 1440) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours} hour${hours !== 1 ? 's' : ''}`;
  } else if (minutes < 10080) {
    const days = Math.floor(minutes / 1440);
    const remainingHours = Math.floor((minutes % 1440) / 60);
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days} day${days !== 1 ? 's' : ''}`;
  } else {
    const weeks = Math.floor(minutes / 10080);
    const remainingDays = Math.floor((minutes % 10080) / 1440);
    return remainingDays > 0 ? `${weeks}w ${remainingDays}d` : `${weeks} week${weeks !== 1 ? 's' : ''}`;
  }
}

// Prepare event data (same as original)
function prepareEventData(issue) {
  const startDate = issue.fields['Start datetime'] 
    ? new Date(issue.fields['Start datetime']) 
    : new Date();
  
  if (!issue.fields['Start datetime']) {
    console.log('No start datetime specified, defaulting to now:', startDate.toISOString());
  }
  
  const durationField = issue.fields.Duration;
  const isAllDay = !durationField;
  
  let event = {
    summary: issue.summary,
    description: `YouTrack Issue: ${issue.id}\n${issue.description || ''}`
  };
  
  if (isAllDay) {
    console.log('No duration specified, creating all-day event');
    const dateStr = startDate.toISOString().split('T')[0];
    event.start = { date: dateStr };
    event.end = { date: dateStr };
  } else {
    const durationMs = parseDuration(durationField);
    const durationMinutes = Math.round(durationMs / 60000);
    
    if (durationMinutes > 10080) {
      console.warn(`Event duration of ${formatReminderTime(durationMinutes)} is unusually long`);
    }
    
    console.log('Event duration:', formatReminderTime(durationMinutes));
    const endDate = new Date(startDate.getTime() + durationMs);
    
    event.start = {
      dateTime: startDate.toISOString(),
      timeZone: 'UTC'
    };
    event.end = {
      dateTime: endDate.toISOString(),
      timeZone: 'UTC'
    };
  }
  
  // Add reminder if set
  const remindBeforeField = issue.fields['Remind before'];
  if (remindBeforeField) {
    const reminderMinutes = parsePeriodToMinutes(remindBeforeField);
    if (reminderMinutes) {
      const maxReminderMinutes = 40320; // 4 weeks
      const actualReminderMinutes = Math.min(reminderMinutes, maxReminderMinutes);
      
      if (reminderMinutes > maxReminderMinutes) {
        console.warn(`Reminder capped at 4 weeks (was ${formatReminderTime(reminderMinutes)})`);
      }
      
      event.reminders = {
        useDefault: false,
        overrides: [{
          method: 'popup',
          minutes: actualReminderMinutes
        }]
      };
    }
  } else {
    event.reminders = {
      useDefault: false,
      overrides: []
    };
  }
  
  return event;
}

// Export functions
exports.buildQueryString = buildQueryString;
exports.getAccessToken = getAccessToken;
exports.refreshAccessToken = refreshAccessToken;
exports.getCalendarId = getCalendarId;
exports.parsePeriodToMinutes = parsePeriodToMinutes;
exports.parseDuration = parseDuration;
exports.formatReminderTime = formatReminderTime;
exports.prepareEventData = prepareEventData;
