/**
 * YouTrack Calendar Sync - Google Apps Script Version
 * Complete implementation for calendar event creation, updates, and deletion
 * 
 * Setup Instructions:
 * 1. Create new Apps Script project at script.google.com
 * 2. Replace Code.gs content with this file
 * 3. Add Google Calendar API service (Services > + > Google Calendar API)
 * 4. Run setupApiKey() once to generate API key
 * 5. Deploy as Web App with "Execute as: Me" and "Anyone" access
 * 6. Copy the web app URL for YouTrack integration
 */

// ============================================================================
// API KEY MANAGEMENT
// ============================================================================

/**
 * Set up API key (run this once to initialize)
 * This generates a secure random API key and stores it persistently
 */
function setupApiKey() {
  const apiKey = 'yt-cal-sync-' + Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty('API_KEY', apiKey);
  console.log('API Key set:', apiKey);
  console.log('IMPORTANT: Copy this API key for your YouTrack configuration!');
  return apiKey;
}

/**
 * Get API key from properties
 * Creates one if it doesn't exist
 */
function getApiKey() {
  let apiKey = PropertiesService.getScriptProperties().getProperty('API_KEY');
  if (!apiKey) {
    apiKey = 'yt-cal-sync-' + Utilities.getUuid();
    PropertiesService.getScriptProperties().setProperty('API_KEY', apiKey);
    console.log('Generated new API Key:', apiKey);
  }
  return apiKey;
}

/**
 * View current API key (for reference)
 */
function viewApiKey() {
  const apiKey = getApiKey();
  console.log('Current API Key:', apiKey);
  return apiKey;
}

// ============================================================================
// HTTP REQUEST HANDLERS
// ============================================================================

/**
 * Handle GET requests - for testing and status checks
 */
function doGet(e) {
  const result = {
    success: true,
    message: 'YouTrack Calendar Sync Web App is running!',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    availableActions: ['create', 'update', 'delete', 'test']
  };
  
  return ContentService
    .createTextOutput(JSON.stringify(result, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Handle POST requests - main entry point for YouTrack integration
 */
function doPost(e) {
  try {
    const API_KEY = getApiKey();
    
    // Log request for debugging
    console.log('POST request received');
    
    if (!e.postData || !e.postData.contents) {
      throw new Error('No POST data received');
    }
    
    const params = JSON.parse(e.postData.contents);
    console.log('Processing action:', params.action);
    
    // Security check - validate API key
    if (!params.apiKey || params.apiKey !== API_KEY) {
      console.warn('Unauthorized access attempt');
      return ContentService
        .createTextOutput(JSON.stringify({
          success: false,
          error: 'Unauthorized - Invalid API key'
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // Route to appropriate handler
    switch(params.action) {
      case 'create':
        return createCalendarEvent(params);
      case 'update': 
        return updateCalendarEvent(params);
      case 'delete':
        return deleteCalendarEvent(params);
      case 'list-calendars':
        return listCalendars();
      case 'test':
        return testConnection();
      default:
        throw new Error('Unknown action: ' + params.action);
    }
    
  } catch (error) {
    console.error('Error processing POST request:', error);
    const errorResponse = {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
    
    return ContentService
      .createTextOutput(JSON.stringify(errorResponse, null, 2))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================================
// CALENDAR EVENT OPERATIONS
// ============================================================================

/**
 * Create a new calendar event
 */
function createCalendarEvent(params) {
  try {
    const { calendarId, eventData } = params;
    
    // Get the calendar (use default if no specific ID provided)
    const calendar = calendarId ? 
      CalendarApp.getCalendarById(calendarId) : 
      CalendarApp.getDefaultCalendar();
    
    let event;
    
    // Handle all-day vs timed events
    if (eventData.isAllDay) {
      const startDate = new Date(eventData.startDate);
      event = calendar.createAllDayEvent(
        eventData.summary,
        startDate,
        {
          description: eventData.description || ''
        }
      );
      console.log('Created all-day event:', eventData.summary, 'on', startDate.toDateString());
    } else {
      const startTime = new Date(eventData.startDateTime);
      const endTime = new Date(eventData.endDateTime);
      
      event = calendar.createEvent(
        eventData.summary,
        startTime,
        endTime,
        {
          description: eventData.description || ''
        }
      );
      console.log('Created timed event:', eventData.summary, 'from', startTime.toISOString(), 'to', endTime.toISOString());
    }
    
    // Add reminders if specified
    if (eventData.reminderMinutes !== undefined && eventData.reminderMinutes >= 0) {
      event.addPopupReminder(eventData.reminderMinutes);
      if (eventData.reminderMinutes === 0) {
        console.log('Added reminder: at event start');
      } else {
        console.log('Added reminder:', eventData.reminderMinutes, 'minutes before event');
      }
    }
    
    // Get the event ID and strip @google.com suffix if present
    let eventId = event.getId();
    
    // Always strip @google.com suffix to store clean event ID
    if (eventId.includes('@google.com')) {
      console.log('Stripping @google.com suffix from event ID:', eventId);
      eventId = eventId.split('@')[0];
      console.log('Clean event ID:', eventId);
    }
    
    const result = {
      success: true,
      eventId: eventId,
      message: 'Event created successfully',
      eventTitle: event.getTitle(),
      eventStart: event.getStartTime().toISOString()
    };
    
    console.log('✅ Event created successfully - ID:', event.getId());
    
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    console.error('❌ Error creating event:', error);
    const errorResult = {
      success: false,
      error: error.message,
      action: 'create'
    };
    
    return ContentService
      .createTextOutput(JSON.stringify(errorResult))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Update existing calendar event
 */
function updateCalendarEvent(params) {
  try {
    const { eventId, eventData, calendarId } = params;
    
    // Find the event by ID in the specific calendar
    console.log('Attempting to find event with ID:', eventId, 'in calendar:', calendarId);

    // Get the specific calendar first
    const calendar = calendarId ? 
      CalendarApp.getCalendarById(calendarId) : 
      CalendarApp.getDefaultCalendar();
    
    console.log('Using calendar:', calendar.getName());

    // Use the calendar-specific getEventById method
    // Note: CalendarApp.getEventById() only works for default calendar
    // calendar.getEventById() works for the specific calendar
    const event = calendar.getEventById(eventId);
    if (!event) {
      console.error('Event not found with ID:', eventId);
      
      // Try to find recent events to compare IDs
      try {
        console.log('Checking default calendar...');
        const defaultCalendar = CalendarApp.getDefaultCalendar();
        const now = new Date();
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const defaultEvents = defaultCalendar.getEvents(oneWeekAgo, now);
        
        console.log('Recent events in DEFAULT calendar:');
        defaultEvents.slice(0, 5).forEach(e => {
          console.log('- ID:', e.getId(), 'Title:', e.getTitle());
        });
        
        // Also check all calendars
        console.log('Checking all accessible calendars...');
        const allCalendars = CalendarApp.getAllCalendars();
        allCalendars.forEach(cal => {
          console.log('Calendar:', cal.getName(), 'ID:', cal.getId());
          try {
            const calEvents = cal.getEvents(oneWeekAgo, now);
            if (calEvents.length > 0) {
              console.log('  Recent events in this calendar:');
              calEvents.slice(0, 3).forEach(e => {
                console.log('  - ID:', e.getId(), 'Title:', e.getTitle());
              });
            }
          } catch (calError) {
            console.log('  Error accessing this calendar:', calError.toString());
          }
        });
      } catch (debugError) {
        console.error('Failed to list recent events for debugging:', debugError);
      }
      
      throw new Error('Event not found: ' + eventId);
    }
    
    console.log('Updating event:', event.getTitle());
    
    // Update basic properties
    if (eventData.summary) {
      event.setTitle(eventData.summary);
    }
    
    if (eventData.description !== undefined) {
      event.setDescription(eventData.description);
    }
    
    // Update times if provided
    if (eventData.startDateTime && eventData.endDateTime) {
      const startTime = new Date(eventData.startDateTime);
      const endTime = new Date(eventData.endDateTime);
      event.setTime(startTime, endTime);
      console.log('Updated event times:', startTime.toISOString(), 'to', endTime.toISOString());
    }
    
    // Update reminders
    if (eventData.reminderMinutes !== undefined) {
      event.removeAllReminders();
      if (eventData.reminderMinutes >= 0) {
        event.addPopupReminder(eventData.reminderMinutes);
        if (eventData.reminderMinutes === 0) {
          console.log('Updated reminder: at event start');
        } else {
          console.log('Updated reminder:', eventData.reminderMinutes, 'minutes');
        }
      } else {
        console.log('Removed all reminders');
      }
    }
    
    // Update color
    if (eventData.colorId !== undefined) {
      if (eventData.colorId === null) {
        // Reset to default color - use "0" to remove color setting
        event.setColor("0");
        console.log('Reset event color to default');
      } else {
        event.setColor(eventData.colorId);
        console.log('Updated event color to:', eventData.colorId);
      }
    }
    
    const result = {
      success: true,
      eventId: event.getId(),
      message: 'Event updated successfully',
      eventTitle: event.getTitle(),
      eventStart: event.getStartTime().toISOString()
    };
    
    console.log('✅ Event updated successfully');
    
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    console.error('❌ Error updating event:', error);
    const errorResult = {
      success: false,
      error: error.message,
      action: 'update'
    };
    
    return ContentService
      .createTextOutput(JSON.stringify(errorResult))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Delete calendar event
 */
function deleteCalendarEvent(params) {
  try {
    const { eventId, calendarId } = params;
    
    console.log('Attempting to delete event with ID:', eventId, 'from calendar:', calendarId);
    
    // Get the specific calendar
    const calendar = calendarId ? 
      CalendarApp.getCalendarById(calendarId) : 
      CalendarApp.getDefaultCalendar();
    
    console.log('Using calendar for delete:', calendar.getName());
    
    // Use calendar-specific getEventById method
    const event = calendar.getEventById(eventId);
    if (!event) {
      throw new Error('Event not found: ' + eventId);
    }
    
    const eventTitle = event.getTitle(); // Get title before deletion
    event.deleteEvent();
    
    const result = {
      success: true,
      message: 'Event deleted successfully',
      deletedEventTitle: eventTitle
    };
    
    console.log('✅ Deleted event:', eventTitle);
    
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    console.error('❌ Error deleting event:', error);
    const errorResult = {
      success: false,
      error: error.message,
      action: 'delete'
    };
    
    return ContentService
      .createTextOutput(JSON.stringify(errorResult))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * List user's calendars
 */
function listCalendars() {
  try {
    const calendars = CalendarApp.getAllCalendars();
    
    // Extract relevant information
    const calendarList = calendars.map(cal => ({
      id: cal.getId(),
      summary: cal.getName(),
      primary: cal.getId() === CalendarApp.getDefaultCalendar().getId(),
      accessRole: 'owner' // Apps Script calendars are owned by the user
    }));
    
    const result = {
      success: true,
      calendars: calendarList,
      message: `Found ${calendarList.length} calendars`
    };
    
    console.log('✅ Listed calendars successfully:', calendarList.length);
    
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    console.error('❌ Error listing calendars:', error);
    const errorResult = {
      success: false,
      error: error.message,
      action: 'list-calendars'
    };
    
    return ContentService
      .createTextOutput(JSON.stringify(errorResult))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Test connection and API functionality
 */
function testConnection() {
  try {
    const calendars = CalendarApp.getAllCalendars();
    const defaultCalendar = CalendarApp.getDefaultCalendar();
    
    const result = {
      success: true,
      message: 'Apps Script is working!',
      timestamp: new Date().toISOString(),
      calendarAccess: true,
      calendarsFound: calendars.length,
      defaultCalendar: defaultCalendar.getName()
    };
    
    console.log('✅ Connection test successful');
    
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    console.error('❌ Connection test failed:', error);
    const errorResult = {
      success: false,
      error: error.message,
      action: 'test'
    };
    
    return ContentService
      .createTextOutput(JSON.stringify(errorResult))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================================
// TESTING FUNCTIONS
// ============================================================================

/**
 * Test POST functionality from within Apps Script
 */
function testPostFromScript() {
  const apiKey = getApiKey();
  
  // Create a test payload like YouTrack would send
  const testPayload = {
    apiKey: apiKey,
    action: 'create',
    calendarId: null, // Use default calendar
    eventData: {
      summary: 'YouTrack Test Event',
      description: 'YouTrack Issue: TEST-123\nThis is a test event from Apps Script integration',
      isAllDay: false,
      startDateTime: new Date(Date.now() + 120000).toISOString(), // 2 minutes from now
      endDateTime: new Date(Date.now() + 3720000).toISOString(), // 1 hour 2 minutes from now
      reminderMinutes: 10
    }
  };
  
  // Simulate the POST request structure
  const mockRequest = {
    postData: {
      contents: JSON.stringify(testPayload)
    }
  };
  
  console.log('Testing POST with payload:', JSON.stringify(testPayload, null, 2));
  
  const result = doPost(mockRequest);
  const response = JSON.parse(result.getContent());
  
  console.log('POST test result:', JSON.stringify(response, null, 2));
  
  if (response.success) {
    console.log('✅ POST test successful! Event ID:', response.eventId);
    return 'POST test passed - check your calendar for the new event!';
  } else {
    console.log('❌ POST test failed:', response.error);
    return 'POST test failed: ' + response.error;
  }
}

/**
 * Test unauthorized access (should fail)
 */
function testUnauthorizedAccess() {
  const testPayload = {
    // No apiKey included - should be rejected
    action: 'test'
  };
  
  const mockRequest = {
    postData: {
      contents: JSON.stringify(testPayload)
    }
  };
  
  const result = doPost(mockRequest);
  const response = JSON.parse(result.getContent());
  
  console.log('Unauthorized test result:', JSON.stringify(response, null, 2));
  
  if (!response.success && response.error.includes('Unauthorized')) {
    console.log('✅ Security test passed - unauthorized access was blocked');
    return 'Security test passed - unauthorized access blocked correctly';
  } else {
    console.log('❌ Security test failed - unauthorized access was allowed');
    return 'Security test failed - this is a security issue!';
  }
}

/**
 * Full integration test
 */
function runFullTest() {
  console.log('🚀 Starting full integration test...');
  
  // Test 1: API Key setup
  const apiKey = getApiKey();
  console.log('Test 1 - API Key:', apiKey ? '✅ OK' : '❌ FAILED');
  
  // Test 2: Calendar access
  try {
    const calendars = CalendarApp.getAllCalendars();
    console.log('Test 2 - Calendar access:', calendars.length > 0 ? '✅ OK' : '❌ FAILED');
  } catch (error) {
    console.log('Test 2 - Calendar access: ❌ FAILED -', error.message);
  }
  
  // Test 3: Create event
  const createResult = testPostFromScript();
  console.log('Test 3 - Create event:', createResult.includes('passed') ? '✅ OK' : '❌ FAILED');
  
  // Test 4: Security
  const securityResult = testUnauthorizedAccess();
  console.log('Test 4 - Security:', securityResult.includes('passed') ? '✅ OK' : '❌ FAILED');
  
  console.log('🏁 Full integration test completed!');
  return 'Full test completed - check logs for details';
}