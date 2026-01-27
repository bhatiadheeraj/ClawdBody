/**
 * Gmail API Client
 * Handles Gmail OAuth and message fetching
 */

import { google } from 'googleapis'

export class GmailClient {
  private oauth2Client: any
  private gmail: any

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
    this.oauth2Client.on('tokens', (tokens: { refresh_token?: string; access_token?: string }) => {
      if (tokens.refresh_token) {
        // Refresh token is only provided on first authorization
        // Store it if provided
      }
      if (tokens.access_token) {
        // Access token was refreshed, should be saved back to database
        // This will be handled by the caller
      }
    })

    this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client })
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
   * Get Gmail messages
   */
  async fetchMessages(maxResults: number = 50): Promise<any[]> {
    try {
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        maxResults,
      })

      if (!response.data.messages) {
        return []
      }

      // Fetch full message details
      const messages = await Promise.all(
        response.data.messages.map(async (msg: any) => {
          const messageResponse = await this.gmail.users.messages.get({
            userId: 'me',
            id: msg.id,
            format: 'full',
          })
          return messageResponse.data
        })
      )

      return messages
    } catch (error: any) {
      console.error('Error fetching Gmail messages:', error)
      throw new Error(`Failed to fetch Gmail messages: ${error.message}`)
    }
  }

  /**
   * Fetch all Gmail messages with pagination
   * Fetches messages in batches to handle large mailboxes efficiently
   * @param batchSize - Number of messages to fetch per API call
   * @param maxTotal - Maximum total messages to fetch (stops when reached)
   */
  async fetchAllMessages(batchSize: number = 100, maxTotal?: number): Promise<any[]> {
    try {
      const allMessages: any[] = []
      let pageToken: string | undefined = undefined
      let hasMore = true

      while (hasMore) {
        // Adjust batch size if we're close to the max total
        const remainingSlots = maxTotal ? maxTotal - allMessages.length : Infinity
        const currentBatchSize = maxTotal ? Math.min(batchSize, remainingSlots) : batchSize

        if (currentBatchSize <= 0) {
          break
        }

        const response: Awaited<ReturnType<typeof this.gmail.users.messages.list>> = await this.gmail.users.messages.list({
          userId: 'me',
          maxResults: currentBatchSize,
          pageToken,
        })

        if (!response.data.messages || response.data.messages.length === 0) {
          hasMore = false
          break
        }

        // Limit to remaining slots if maxTotal is set
        const messagesToFetch = maxTotal 
          ? response.data.messages.slice(0, remainingSlots)
          : response.data.messages

        // Fetch full message details for this batch
        const batchMessages = await Promise.all(
          messagesToFetch.map(async (msg: any) => {
            try {
              const messageResponse = await this.gmail.users.messages.get({
                userId: 'me',
                id: msg.id,
                format: 'full',
              })
              return messageResponse.data
            } catch (error: any) {
              console.error(`Error fetching message ${msg.id}:`, error)
              return null
            }
          })
        )

        // Filter out any failed fetches
        const validMessages = batchMessages.filter(msg => msg !== null)
        allMessages.push(...validMessages)

        // Stop if we've reached the max total
        if (maxTotal && allMessages.length >= maxTotal) {
          hasMore = false
          break
        }

        // Check if there are more pages
        pageToken = response.data.nextPageToken
        hasMore = !!pageToken

        // Log progress
        console.log(`Fetched ${allMessages.length} messages so far...`)
      }

      return allMessages
    } catch (error: any) {
      console.error('Error fetching all Gmail messages:', error)
      throw new Error(`Failed to fetch all Gmail messages: ${error.message}`)
    }
  }

  /**
   * Fetch new Gmail messages since a specific date
   * Uses Gmail's search query to filter messages by date
   * @param sinceDate - Only fetch messages after this date
   * @param batchSize - Number of messages to fetch per API call
   * @param maxTotal - Maximum total messages to fetch (stops when reached)
   */
  async fetchNewMessagesSince(sinceDate: Date, batchSize: number = 100, maxTotal?: number): Promise<any[]> {
    try {
      // Format date for Gmail query (Gmail uses Unix timestamp in seconds)
      const sinceTimestamp = Math.floor(sinceDate.getTime() / 1000)
      // Gmail query: after:timestamp (in seconds)
      const query = `after:${sinceTimestamp}`

      const allMessages: any[] = []
      let pageToken: string | undefined = undefined
      let hasMore = true

      while (hasMore) {
        // Adjust batch size if we're close to the max total
        const remainingSlots = maxTotal ? maxTotal - allMessages.length : Infinity
        const currentBatchSize = maxTotal ? Math.min(batchSize, remainingSlots) : batchSize

        if (currentBatchSize <= 0) {
          break
        }

        const response: Awaited<ReturnType<typeof this.gmail.users.messages.list>> = await this.gmail.users.messages.list({
          userId: 'me',
          maxResults: currentBatchSize,
          pageToken,
          q: query, // Search query to filter by date
        })

        if (!response.data.messages || response.data.messages.length === 0) {
          hasMore = false
          break
        }

        // Limit to remaining slots if maxTotal is set
        const messagesToFetch = maxTotal 
          ? response.data.messages.slice(0, remainingSlots)
          : response.data.messages

        // Fetch full message details for this batch
        const batchMessages = await Promise.all(
          messagesToFetch.map(async (msg: any) => {
            try {
              const messageResponse = await this.gmail.users.messages.get({
                userId: 'me',
                id: msg.id,
                format: 'full',
              })
              return messageResponse.data
            } catch (error: any) {
              console.error(`Error fetching message ${msg.id}:`, error)
              return null
            }
          })
        )

        // Filter out any failed fetches
        const validMessages = batchMessages.filter(msg => msg !== null)
        allMessages.push(...validMessages)

        // Stop if we've reached the max total
        if (maxTotal && allMessages.length >= maxTotal) {
          hasMore = false
          break
        }

        // Check if there are more pages
        pageToken = response.data.nextPageToken
        hasMore = !!pageToken

        console.log(`Fetched ${allMessages.length} new messages so far...`)
      }

      return allMessages
    } catch (error: any) {
      console.error('Error fetching new Gmail messages:', error)
      throw new Error(`Failed to fetch new Gmail messages: ${error.message}`)
    }
  }

  /**
   * Get user's email address
   */
  async getUserEmail(): Promise<string> {
    try {
      const profile = await this.gmail.users.getProfile({
        userId: 'me',
      })
      return profile.data.emailAddress || ''
    } catch (error: any) {
      console.error('Error fetching user email:', error)
      throw new Error(`Failed to fetch user email: ${error.message}`)
    }
  }

  /**
   * Send an email
   * @param to - Recipient email address(es) - can be string or array
   * @param subject - Email subject
   * @param body - Email body (plain text or HTML)
   * @param options - Additional options (cc, bcc, replyTo, etc.)
   */
  async sendEmail(
    to: string | string[],
    subject: string,
    body: string,
    options?: {
      cc?: string | string[]
      bcc?: string | string[]
      replyTo?: string
      html?: boolean
    }
  ): Promise<string> {
    try {
      const toAddresses = Array.isArray(to) ? to.join(', ') : to
      const ccAddresses = options?.cc ? (Array.isArray(options.cc) ? options.cc.join(', ') : options.cc) : ''
      const bccAddresses = options?.bcc ? (Array.isArray(options.bcc) ? options.bcc.join(', ') : options.bcc) : ''
      const replyTo = options?.replyTo || ''

      // Get user's email for the From field
      const fromEmail = await this.getUserEmail()

      // Create email message in RFC 2822 format
      const messageParts = [
        `To: ${toAddresses}`,
        ccAddresses ? `Cc: ${ccAddresses}` : '',
        bccAddresses ? `Bcc: ${bccAddresses}` : '',
        replyTo ? `Reply-To: ${replyTo}` : '',
        `Subject: ${subject}`,
        options?.html ? 'Content-Type: text/html; charset=utf-8' : 'Content-Type: text/plain; charset=utf-8',
        '',
        body,
      ].filter(Boolean).join('\n')

      // Encode message in base64url format (Gmail API requirement)
      const encodedMessage = Buffer.from(messageParts)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')

      const response = await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage,
        },
      })

      return response.data.id || ''
    } catch (error: any) {
      console.error('Error sending email:', error)
      throw new Error(`Failed to send email: ${error.message}`)
    }
  }

  /**
   * Reply to an email
   * @param messageId - ID of the message to reply to
   * @param body - Reply body
   * @param options - Additional options
   */
  async replyToEmail(
    messageId: string,
    body: string,
    options?: {
      html?: boolean
    }
  ): Promise<string> {
    try {
      // Get the original message
      const originalMessage = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      })

      const headers = originalMessage.data.payload?.headers || []
      const getHeader = (name: string) =>
        headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || ''

      const originalSubject = getHeader('Subject')
      const originalFrom = getHeader('From')
      const replyTo = getHeader('Reply-To') || originalFrom

      // Remove "Re:" prefix if already present and add it
      const subject = originalSubject.startsWith('Re:') 
        ? originalSubject 
        : `Re: ${originalSubject}`

      // Get user's email
      const fromEmail = await this.getUserEmail()

      // Create reply message
      const messageParts = [
        `To: ${replyTo}`,
        `Subject: ${subject}`,
        `In-Reply-To: ${originalMessage.data.id}`,
        `References: ${originalMessage.data.id}`,
        options?.html ? 'Content-Type: text/html; charset=utf-8' : 'Content-Type: text/plain; charset=utf-8',
        '',
        body,
      ].filter(Boolean).join('\n')

      const encodedMessage = Buffer.from(messageParts)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')

      const response = await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage,
          threadId: originalMessage.data.threadId,
        },
      })

      return response.data.id || ''
    } catch (error: any) {
      console.error('Error replying to email:', error)
      throw new Error(`Failed to reply to email: ${error.message}`)
    }
  }

  /**
   * Format Gmail message for vault storage
   */
  formatMessageForVault(message: any): string {
    const headers = message.payload?.headers || []
    const getHeader = (name: string) => 
      headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || ''

    const subject = getHeader('Subject')
    const from = getHeader('From')
    const to = getHeader('To')
    const date = getHeader('Date')
    const snippet = message.snippet || ''

    // Extract body text
    let bodyText = ''
    if (message.payload?.body?.data) {
      bodyText = Buffer.from(message.payload.body.data, 'base64').toString('utf-8')
    } else if (message.payload?.parts) {
      for (const part of message.payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          bodyText = Buffer.from(part.body.data, 'base64').toString('utf-8')
          break
        }
      }
    }

    return `# ${subject || 'No Subject'}

**From:** ${from}
**To:** ${to}
**Date:** ${date}
**Message ID:** ${message.id}

## Snippet
${snippet}

## Body
${bodyText}

---
*Synced from Gmail on ${new Date().toISOString()}*
`
  }
}

/**
 * Get Google OAuth2 authorization URL
 */
export function getGmailAuthUrl(): string {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || `${process.env.NEXTAUTH_URL}/api/integrations/gmail/callback`
  )

  const scopes = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.compose',
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
export async function getGmailTokens(code: string): Promise<{
  access_token: string
  refresh_token?: string
  expires_in?: number
}> {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || `${process.env.NEXTAUTH_URL}/api/integrations/gmail/callback`
  )

  const { tokens } = await oauth2Client.getToken(code)
  return tokens as any
}

