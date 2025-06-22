# Google Calendar Synchronisation App for YouTrack

Map YouTrack issues to Google Calendar events.

## Features

* Per-user synchronisation: calendar events are created in the user-specified
  calendar and only for issues assigned to the user.
* Immediate synchronisation of issue updates, including start date-time,
  duration and the summary.
* Support for Google Calendar reminders.
* Support for "All-day" events.
* Events corresponding to resolved issues change colours!
* If the issue is deleted, the corresponding event is deleted as well.

## Technical Details

### Required Issue Fields

| Field name        | Field type | Description                                                                  |
|-------------------|------------|------------------------------------------------------------------------------|
| Assignee          | User       | Calendar events are created in the issue assignee's calendar, if configured. |
| Start datetime    | dateTime   | If not specified, the event isn't created.                                   |
| Estimation          | period     | If not specified, the event is "All-day".                                    |
| Remind before     | period     |                                                                              |
| Calendar Event ID | string     | Google Calendar event's ID.                                                  |

### Authentication

Calendar changes are made via Google Apps Script. Each user deploys their own Google Apps Script web app that handles all Google Calendar API operations. This approach eliminates the need for OAuth token management, app verification, and periodic re-authentication. The Apps Script runs with the user's own Google account permissions and requires only an API key for secure communication.

## Configuration (YouTrack Administrator)

### Install the YouTrack App

Install the app from the Market or by running

```bash
./build_zip.sh
```

and installing the resulting ZIP archive manually.

### Configure the App

Go to the app settings and select applicable projects.

For the selected projects add the issue fields as specified in the **Required Issue Fields** section above.

## Configuration (YouTrack User)

Each user must deploy their own Google Apps Script to enable calendar synchronization:

### Step 1: Deploy Google Apps Script

1. Go to [script.google.com](https://script.google.com)
2. Click **New Project**
3. Replace the default `Code.gs` content with the code from the `Code.gs` file in this repository
4. Click **Save** and give your project a name (e.g., "YouTrack Calendar Sync")
5. Run the `setupApiKey()` function once:
   - Select `setupApiKey` from the function dropdown
   - Click **Run**
   - Grant necessary permissions when prompted
   - Check the execution log for your generated API key (copy this for later)
6. Deploy as a web app:
   - Click **Deploy** → **New Deployment**
   - Click the gear icon and select **Web app**
   - Set **Execute as**: "Me"
   - Set **Who has access**: "Anyone"
   - Click **Deploy**
   - Copy the Web App URL (it will look like `https://script.google.com/macros/s/.../exec`)

### Step 2: Configure YouTrack Integration

1. In YouTrack, go to your issue and look for the **Google Calendar Setup** widget
2. Paste your Apps Script Web App URL
3. Paste your API key (generated in Step 1.5)
4. Click **Save Configuration**
5. Click **Test Connection** to verify everything works
6. Click **Show My Calendars** to browse your available calendars
7. Select the calendar you want to use for YouTrack events
8. Click **Save Calendar**

That's it! Your YouTrack issues will now automatically sync with your Google Calendar.

## Troubleshooting

### Common Issues

**"Connection failed" when testing Apps Script:**
- Verify your Apps Script URL is correct and starts with `https://script.google.com/macros/`
- Make sure you deployed the Apps Script as a web app with "Anyone" access
- Check that you generated the API key by running `setupApiKey()` function

**Events not appearing in calendar:**
- Ensure your issue has a "Start datetime" field set (events are not created for unplanned issues)
- Verify the issue is assigned to a user who has configured their Apps Script
- Check the Apps Script execution logs at script.google.com for any errors

**"Event not found" errors:**
- This usually indicates the event was manually deleted from Google Calendar
- Try unassigning and reassigning the issue to recreate the event

### Debugging

- Check YouTrack workflow logs for detailed error messages
- View Apps Script execution logs at script.google.com → Executions
- Use browser developer console for frontend widget issues

## Known bugs

* ([#11](https://github.com/x1o/youtrack-gcal-sync/issues/11)) All-day events are created in the UTC timezone.  E.g. if the user's timezone
  is 'UTC+1', creating an issue with `Start datetime` = *2020-01-02 00:00:00*
  and an undefined `Estimation` will actually create an all-day event at
  *2020-01-01*. Workaround: use `Start datetime` at least *2020-01-02 01:00:00*.
