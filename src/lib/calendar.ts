/**
 * Google Calendar API Client
 * Handles Calendar OAuth and event fetching
 */

import { google } from 'googleapis'

export class CalendarClient {
  private oauth2Client: any
  private calendar: any

  constructor(accessToken: string, refreshToken?: string) {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || `${process.env.NEXTAUTH_URL}/api/auth/callback/google`
    )

    this.oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    })

    // Set up token refresh handler
    this.oauth2Client.on('tokens', (tokens: any) => {
      if (tokens.refresh_token) {
        // Refresh token is only provided on first authorization
        // Store it if provided
      }
      if (tokens.access_token) {
        // Access token was refreshed, should be saved back to database
        // This will be handled by the caller
      }
    })

    this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client })
  }

  /**
   * Get current access token (may be refreshed automatically)
   */
  async getAccessToken(): Promise<string> {
    const credentials = await this.oauth2Client.getAccessToken()
    return credentials.token || ''
  }

  /**
   * Get current credentials (including refreshed tokens)
   * The OAuth2 client stores credentials internally
   */
  getCredentials() {
    return this.oauth2Client.credentials
  }

  /**
   * Get user's calendar email/ID
   */
  async getUserCalendarEmail(): Promise<string> {
    try {
      const response = await this.calendar.calendarList.list()
      const primaryCalendar = response.data.items?.find((cal: any) => cal.primary)
      return primaryCalendar?.id || 'primary'
    } catch (error: any) {
      console.error('Error fetching calendar email:', error)
      throw new Error(`Failed to fetch calendar email: ${error.message}`)
    }
  }

  /**
   * Fetch calendar events
   */
  async fetchEvents(maxResults: number = 50): Promise<any[]> {
    try {
      const response: any = await this.calendar.events.list({
        calendarId: 'primary',
        maxResults,
        singleEvents: true,
        orderBy: 'startTime',
      })

      return response.data.items || []
    } catch (error: any) {
      console.error('Error fetching calendar events:', error)
      throw new Error(`Failed to fetch calendar events: ${error.message}`)
    }
  }

  /**
   * Fetch all calendar events with pagination
   */
  async fetchAllEvents(batchSize: number = 100): Promise<any[]> {
    try {
      const allEvents: any[] = []
      let pageToken: string | undefined = undefined
      let hasMore = true

      while (hasMore) {
        const response: any = await this.calendar.events.list({
          calendarId: 'primary',
          maxResults: batchSize,
          singleEvents: true,
          orderBy: 'startTime',
          pageToken,
        })

        const events = response.data.items || []
        allEvents.push(...events)

        pageToken = response.data.nextPageToken
        hasMore = !!pageToken

        console.log(`Fetched ${allEvents.length} events so far...`)
      }

      return allEvents
    } catch (error: any) {
      console.error('Error fetching all calendar events:', error)
      throw new Error(`Failed to fetch all calendar events: ${error.message}`)
    }
  }

  /**
   * Fetch new calendar events since a specific date
   */
  async fetchNewEventsSince(sinceDate: Date, batchSize: number = 100): Promise<any[]> {
    try {
      const allEvents: any[] = []
      let pageToken: string | undefined = undefined
      let hasMore = true

      while (hasMore) {
        const response: any = await this.calendar.events.list({
          calendarId: 'primary',
          maxResults: batchSize,
          singleEvents: true,
          orderBy: 'startTime',
          timeMin: sinceDate.toISOString(),
          pageToken,
        })

        const events = response.data.items || []
        allEvents.push(...events)

        pageToken = response.data.nextPageToken
        hasMore = !!pageToken

        console.log(`Fetched ${allEvents.length} new events so far...`)
      }

      return allEvents
    } catch (error: any) {
      console.error('Error fetching new calendar events:', error)
      throw new Error(`Failed to fetch new calendar events: ${error.message}`)
    }
  }

  /**
   * Format calendar event for vault storage
   */
  formatEventForVault(event: any): string {
    const summary = event.summary || 'No Title'
    const description = event.description || ''
    const location = event.location || ''
    const start = event.start?.dateTime || event.start?.date || ''
    const end = event.end?.dateTime || event.end?.date || ''
    const organizer = event.organizer?.email || ''
    const attendees = event.attendees?.map((a: any) => a.email).join(', ') || ''
    const status = event.status || ''
    const htmlLink = event.htmlLink || ''

    // Format date/time nicely
    const formatDateTime = (dateTime: string) => {
      if (!dateTime) return ''
      try {
        const date = new Date(dateTime)
        return date.toLocaleString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZoneName: 'short',
        })
      } catch {
        return dateTime
      }
    }

    return `# ${summary}

**Start:** ${formatDateTime(start)}
**End:** ${formatDateTime(end)}
**Status:** ${status}
${location ? `**Location:** ${location}` : ''}
${organizer ? `**Organizer:** ${organizer}` : ''}
${attendees ? `**Attendees:** ${attendees}` : ''}
${htmlLink ? `**Link:** ${htmlLink}` : ''}

## Description
${description}

---
*Event ID: ${event.id}*
*Synced from Google Calendar on ${new Date().toISOString()}*
`
  }
}

/**
 * Get Google Calendar OAuth2 authorization URL
 */
export function getCalendarAuthUrl(): string {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || `${process.env.NEXTAUTH_URL}/api/auth/callback/google`
  )

  const scopes = [
    'https://www.googleapis.com/auth/calendar.readonly',
  ]

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
  })
}

/**
 * Exchange authorization code for tokens
 */
export async function getCalendarTokens(code: string): Promise<{
  access_token: string
  refresh_token?: string
  expires_in?: number
}> {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || `${process.env.NEXTAUTH_URL}/api/auth/callback/google`
  )

  const { tokens } = await oauth2Client.getToken(code)
  return tokens as any
}

