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

// Helper function to get user's Apps Script configuration
function getUserAppsScriptConfig(user) {
  const url = user.extensionProperties.googleAppsScriptUrl;
  const apiKey = user.extensionProperties.googleAppsScriptApiKey;

  if (!url || !apiKey) {
    throw new Error(`Apps Script not configured for user ${user.login}. They need to set their Apps Script URL and API key in the Google Calendar Setup widget.`);
  }

  return { url, apiKey };
}

// Wrapper function for Apps Script API calls
// Handles redirects and response parsing properly
function callAppsScriptAPI(user, action, params = {}) {
  const { url, apiKey } = getUserAppsScriptConfig(user);
  
  console.log(`Making Apps Script API call for user ${user.login}, action: ${action}`);

  // Prepare request payload
  const payload = {
    apiKey: apiKey,
    action: action,
    ...params
  };

  try {
    // Step 1: Make the initial POST request to Apps Script
    const connection = new http.Connection(url);
    connection.addHeader('Content-Type', 'application/json');
    
    console.log('Making initial POST request to Apps Script...');
    const initialResponse = connection.postSync('', {}, JSON.stringify(payload));
    
    // Step 2: Check if we got a redirect (Google Apps Script behavior)
    // Note: Sometimes status is undefined in YouTrack, so check for HTML redirect pattern too
    const isRedirect = (initialResponse.status >= 300 && initialResponse.status < 400) || 
                      (initialResponse.response && initialResponse.response.includes('Moved Temporarily'));
    
    if (isRedirect) {
      console.log(`Received redirect response (status ${initialResponse.status}), following redirect...`);
      
      // Try to extract redirect URL from Location header
      let redirectUrl = null;
      if (initialResponse.headers && initialResponse.headers.Location) {
        redirectUrl = initialResponse.headers.Location;
      } else if (initialResponse.headers && initialResponse.headers.location) {
        redirectUrl = initialResponse.headers.location;
      }
      
      if (!redirectUrl) {
        // If no location header, try to parse from HTML response
        const htmlResponse = initialResponse.response || '';
        console.log('Parsing redirect from HTML response...');
        console.log('HTML response snippet:', htmlResponse.substring(0, 300));
        
        // Try multiple patterns to extract redirect URL
        let hrefMatch = htmlResponse.match(/HREF="([^"]+)"/i);
        if (!hrefMatch) {
          // Try lowercase
          hrefMatch = htmlResponse.match(/href="([^"]+)"/);
        }
        if (!hrefMatch) {
          // Try without quotes
          hrefMatch = htmlResponse.match(/href=([^\s>]+)/i);
        }
        
        if (hrefMatch) {
          redirectUrl = hrefMatch[1];
          // Decode HTML entities
          redirectUrl = redirectUrl.replace(/&amp;/g, '&');
          console.log('Extracted URL from href:', redirectUrl);
        } else {
          // Try looking for the specific pattern in Google's redirect response
          const fullUrlMatch = htmlResponse.match(/https:\/\/script\.googleusercontent\.com\/macros\/echo\?[^">\s]+/);
          if (fullUrlMatch) {
            redirectUrl = fullUrlMatch[0].replace(/&amp;/g, '&');
            console.log('Found full URL in HTML:', redirectUrl);
          }
        }
      }
      
      if (redirectUrl) {
        console.log('Following redirect to:', redirectUrl);
        
        // Step 3: Make GET request to redirect URL
        const redirectConnection = new http.Connection(redirectUrl);
        const finalResponse = redirectConnection.getSync('', {});
        
        // Step 4: Parse the final JSON response
        return parseAppsScriptResponse(finalResponse, user.login);
      } else {
        console.error('Failed to parse redirect URL from response. HTML content:', initialResponse.response ? initialResponse.response.substring(0, 500) : 'No response body');
        throw new Error('Received redirect but could not find redirect URL. Check Apps Script deployment settings.');
      }
    } else {
      // No redirect, parse response directly
      console.log(`Received direct response (status ${initialResponse.status})`);
      return parseAppsScriptResponse(initialResponse, user.login);
    }

  } catch (error) {
    // Enhanced error logging
    console.error(`Apps Script API call failed for user ${user.login}:`, error.toString());
    if (error.response) {
      console.error('Error response:', typeof error.response === 'object' ? JSON.stringify(error.response) : error.response);
    }

    // Re-throw with more context
    throw new Error(`Apps Script API error: ${error.message || error.toString()}`);
  }
}

// Helper function to parse Apps Script responses
function parseAppsScriptResponse(response, userLogin) {
  if (response.response) {
    try {
      const parsedResponse = JSON.parse(response.response);
      
      if (!parsedResponse.success) {
        throw new Error(parsedResponse.error || 'Apps Script API call failed');
      }
      
      console.log(`Apps Script API call successful for user ${userLogin}`);
      return parsedResponse;
    } catch (parseError) {
      console.error('Failed to parse Apps Script response:', response.response);
      throw new Error('Invalid response from Apps Script');
    }
  }

  throw new Error('Empty response from Apps Script');
}

// Function to list user's calendars via Apps Script
function listUserCalendars(user) {
  try {
    const response = callAppsScriptAPI(user, 'list-calendars');
    return response.calendars || [];
  } catch (error) {
    console.error('Failed to list calendars via Apps Script:', error.toString());
    throw new Error(`Failed to retrieve calendar list: ${error.message}`);
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
function parseEstimation(durationField) {
  if (!durationField) {
    return null;  // Return null when no duration is set
  }

  console.log('Estimation:', durationField.toString());
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

// Helper function to prepare event data for Apps Script
function prepareEventData(issue) {
  // Start datetime is required - don't create events for unplanned issues
  if (!issue.fields['Start datetime']) {
    throw new Error('Cannot create calendar event without start datetime - issue is unplanned');
  }

  const startDate = new Date(issue.fields['Start datetime']);

  // Check if duration is specified
  const durationField = issue.fields.Estimation;
  const isAllDay = !durationField;

  let eventData = {
    summary: issue.summary,
    description: `YouTrack Issue: ${issue.id}\n${issue.description || ''}`,
    isAllDay: isAllDay
  };

  if (isAllDay) {
    console.log('No duration specified, creating all-day event');
    
    // For all-day events, use date string format
    eventData.startDate = startDate.toISOString().split('T')[0];
  } else {
    // Parse duration for timed events
    const durationMs = parseEstimation(durationField);
    const durationMinutes = Math.round(durationMs / 60000);

    // Warn if duration seems unusually long (more than 1 week)
    if (durationMinutes > 10080) {
      console.warn(`Event duration of ${formatReminderTime(durationMinutes)} is unusually long for a calendar event`);
    }

    console.log('Event duration:', formatReminderTime(durationMinutes));
    const endDate = new Date(startDate.getTime() + durationMs);

    console.log('Calendar event times - Start:', startDate.toISOString(), 'End:', endDate.toISOString());

    // For timed events, use ISO datetime strings
    eventData.startDateTime = startDate.toISOString();
    eventData.endDateTime = endDate.toISOString();
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
      const maxReminderMinutes = 40320; // 4 weeks
      const actualReminderMinutes = Math.min(reminderMinutes, maxReminderMinutes);

      if (reminderMinutes > maxReminderMinutes) {
        console.warn(`Reminder time ${formatReminderTime(reminderMinutes)} exceeds Google Calendar maximum of 4 weeks. Setting to 4 weeks.`);
      }

      eventData.reminderMinutes = actualReminderMinutes;
    } else {
      console.log('Failed to parse reminder period - no reminder set');
      eventData.reminderMinutes = 0;
    }
  } else {
    console.log('No reminder set');
    eventData.reminderMinutes = 0;
  }

  return eventData;
}

// Export all helper functions and constants
exports.getUserCalendarId = getUserCalendarId;
exports.getUserAppsScriptConfig = getUserAppsScriptConfig;
exports.callAppsScriptAPI = callAppsScriptAPI;
exports.listUserCalendars = listUserCalendars;
exports.parseEstimation = parseEstimation;
exports.parsePeriodToMinutes = parsePeriodToMinutes;
exports.formatReminderTime = formatReminderTime;
exports.prepareEventData = prepareEventData;
