# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a YouTrack app that synchronizes YouTrack issues with Google Calendar events. It creates calendar events for issues assigned to users in their personal Google calendars, with real-time synchronization of updates including start datetime, duration, reminders, and resolution status. Events are color-coded (Sage green for resolved issues) and support both all-day and timed event types.

## Development Commands

- `npm run dev` - Start development server with Vite
- `npm run build` - Build the app (TypeScript compilation + Vite build + YouTrack app validation)
- `npm run lint` - Run ESLint with strict warnings (max 0 warnings)
- `npm run pack` - Create distributable ZIP file
- `npm run upload` - Upload to YouTrack instance
- `./build_zip.sh` - Alternative build script that creates ZIP

## Architecture

### Core Components

**Backend API (`src/backend.js`)**
- HTTP endpoint handlers for Apps Script configuration and calendar operations
- Apps Script endpoints: `/appscript/config`, `/appscript/test`
- Calendar endpoints: `/calendar/id`, `/calendar/list`
- Uses YouTrack scripting API for HTTP connections

**Calendar Sync Helpers (`src/calendar-sync-helpers.js`)**
- Core business logic for Google Calendar integration via Apps Script
- Apps Script API wrapper (`callAppsScriptAPI`) with redirect handling for Google's web app responses
- Event data preparation and ISO 8601 period parsing (PT30M, P1W2DT3H format)
- Handles all-day vs timed events, reminders, and timezone handling
- No token management needed (handled by Apps Script)

**Event Management Workflows**
- `src/create-calendar-event.js` - Creates events when issues are assigned, deletes when unassigned
- `src/update-calendar-event.js` - Updates events when issue details change, handles event type switching (all-day ↔ timed)
- `src/delete-calendar-event.js` - Removes events when issues are deleted

**Frontend Widget (`src/widgets/google-calendar-sync-widget/`)**
- React/TypeScript user interface for Apps Script setup
- Apps Script URL and API key configuration
- Calendar selection via Apps Script integration
- Built with Ring UI components

**Google Apps Script (`Code.gs`)**
- Deployed by each user as their own web app
- Handles all Google Calendar API operations including color changes
- API key authentication for security
- Actions: create, update, delete, list-calendars, test
- Supports event color changes (colorId "2" for Sage/resolved, "0" for default/unresolved)

### Data Flow

1. **Setup**: Users deploy their own Google Apps Script and configure URL + API key in YouTrack widget
2. **Storage**: Apps Script credentials stored in YouTrack user extension properties
3. **Triggers**: Issue changes (assignment, start datetime, estimation, summary, resolution) trigger workflows
4. **Processing**: All calendar operations go through the `callAppsScriptAPI` wrapper with proper redirect handling
5. **Calendar Selection**: Users can browse and select from their available Google Calendars
6. **Event Management**: Events created/updated/deleted with proper calendar targeting and color coding

### Key Technical Details

**Authentication**: Each user deploys their own Apps Script with API key authentication
**No Token Expiration**: Apps Script runs with user's built-in Google account permissions
**Event Types**: Supports both all-day events (no Estimation) and timed events (with ISO 8601 Estimation)
**Event Type Switching**: Automatically converts between all-day and timed by deleting and recreating events
**Color Management**: Sage green (colorId "2") for resolved issues, default color for unresolved
**Calendar Targeting**: All operations target user's selected calendar via calendarId parameter
**Event ID Format**: Strips @google.com suffix when storing, passes calendarId for lookups
**Timezone Handling**: Proper timezone conversion for all-day events using Apps Script's Utilities.formatDate()
**Required YouTrack Fields**: Assignee (User), Start datetime (dateTime), Estimation (period), Remind before (period), Calendar Event ID (string)
**Apps Script Security**: API key prevents unauthorized access to user's calendar

## Build System

- **TypeScript**: Multiple tsconfig files (app, node, base)
- **Vite**: Frontend bundling with React plugin and static copy plugin
- **ESLint**: Strict configuration with JSX accessibility rules
- **YouTrack Tools**: App validation and upload via `@jetbrains/youtrack-apps-tools`

## Configuration

**Global Settings**: No global configuration required (empty settings.json)
**User Settings**: Each user configures their own Apps Script URL and API key in their profile widget
**User Extension Properties**: googleCalendarId, googleAppsScriptUrl, googleAppsScriptApiKey (OAuth properties removed)

## Verified Working Features

✅ **Apps Script Integration**
- Google Apps Script deployment and authentication
- Redirect handling for Google's web app responses
- API key security and connection testing

✅ **Calendar Event Management**
- Creating events when issues are assigned
- Updating events when issue details change (summary, dates, duration, reminders)
- Deleting events when issues are unassigned or deleted
- Proper event ID format handling (strips @google.com suffix)

✅ **Event Type Switching**
- All-day events for issues without Estimation
- Timed events for issues with Estimation (ISO 8601 duration parsing)
- Automatic conversion between types by delete/recreate

✅ **Color Coding**
- Sage green (colorId "2") for resolved issues
- Default color (colorId "0") for unresolved issues
- Proper color reset functionality

✅ **Calendar Selection**
- Browse and list user's available Google Calendars
- Target specific calendar for all operations
- Consistent calendarId parameter usage across all API calls

✅ **Timezone Support**
- Correct all-day event dates regardless of user timezone
- Handles timezone conversion in Apps Script using Utilities.formatDate()
- Fixes issues where midnight start times appeared on wrong date

✅ **Reminder Support**
- Supports all reminder intervals including 0 minutes (at event start)
- Proper handling of ISO 8601 period formats for "Remind before" field
- Google Calendar reminder limits enforced (max 4 weeks)

## Testing

No automated tests currently configured (`npm test` outputs "no tests").