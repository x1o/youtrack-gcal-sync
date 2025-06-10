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

Calendar changes are made by a Google Cloud app. To communicate with the app, an *access token* is required. In order to obtain the token, the user first authorises to the app and receives back an *authorisation code*. The code is used by this YouTrack app to obtain a *refresh token*. The refresh token is stored indefinitely in the app (as a user property, in fact) and used to periodically obtain the desired *access token*s.

## Configuration (YouTrack Administrator)

### Create & Configure a Google Cloud App

Google Calendar access is somewhat involved.

1. [Create a Google Cloud project](https://console.cloud.google.com/projectcreate)
2. In the Google Cloud console, [enable the Google Calendar API](https://console.cloud.google.com/apis/enableflow?apiid=calendar-json.googleapis.com)
3. [Configure the OAuth consent screen](https://console.cloud.google.com/auth/branding)
4. [Authorize credentials](https://console.cloud.google.com/auth/clients)
	* Click "Create client"
	* Select "Application type": "Desktop app"
	* Enter "Name": arbitrary, e.g. "YouTrack"
	* Make sure to save the Client ID and Client secret
5. While the project is in testing mode, [add users manually](https://console.cloud.google.com/auth/audience), or make the app public

([source](https://developers.google.com/workspace/calendar/api/quickstart/js))

### Install the YouTrack App
Install the app from the Market or by running

```bash
./build_zip.sh
```

and installing the resulting ZIP archive manually.

### Configure the App

Go to the app settings and

1. Specify Google OAuth Client ID and Google OAuth Client secret
2. Select applicable projects

Finally, for the selected projects add the issue fields as specified in the **Required Issue Fields** section above.

## Configuration (YouTrack User)

Go to User profile -> Google Calendar Sync Settings and follow the instructions. Basically,

1. Authorise with Google Calendar App
2. Paste the authorisation code
3. Select the calendar & Click Save Calendar ID

## Troubleshooting

See workflow logs and the browser console.

Google only allows one active refresh token per user/app combination. To re-authenticate, [revoke the authentication manually](https://myaccount.google.com/connections) (see [this post](https://groups.google.com/g/adwords-api/c/Ra6ZUUw-E_Y)).

## Known bugs

* ([#11](https://github.com/x1o/youtrack-gcal-sync/issues/11)) All-day events are created in the UTC timezone.  E.g. if the user's timezone
  is 'UTC+1', creating an issue with `Start datetime` = *2020-01-02 00:00:00*
  and an undefined `Estimation` will actually create an all-day event at
  *2020-01-01*. Workaround: use `Start datetime` at least *2020-01-02 01:00:00*.
