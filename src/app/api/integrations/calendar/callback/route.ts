import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { GitHubClient } from '@/lib/github'
import { CalendarClient, getCalendarTokens } from '@/lib/calendar'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.redirect(new URL('/?error=unauthorized', request.url))
    }

    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const error = searchParams.get('error')

    if (error) {
      return NextResponse.redirect(new URL('/learning-sources?error=calendar_auth_failed', request.url))
    }

    if (!code) {
      return NextResponse.redirect(new URL('/learning-sources?error=no_code', request.url))
    }

    // Exchange code for tokens
    const tokens = await getCalendarTokens(code)

    // Store Calendar account in database
    await prisma.account.upsert({
      where: {
        provider_providerAccountId: {
          provider: 'calendar',
          providerAccountId: session.user.email || session.user.id,
        },
      },
      create: {
        userId: session.user.id,
        type: 'oauth',
        provider: 'calendar',
        providerAccountId: session.user.email || session.user.id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expires_in ? Math.floor(Date.now() / 1000) + tokens.expires_in : null,
        token_type: 'Bearer',
        scope: 'https://www.googleapis.com/auth/calendar.readonly',
      },
      update: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expires_in ? Math.floor(Date.now() / 1000) + tokens.expires_in : null,
      },
    })

    // Get user's setup state to find vault repo
    const setupState = await prisma.setupState.findUnique({
      where: { userId: session.user.id },
    })

    if (!setupState?.vaultRepoName) {
      return NextResponse.redirect(new URL('/learning-sources?error=no_vault', request.url))
    }

    // Get GitHub access token for writing to vault
    const githubAccount = await prisma.account.findFirst({
      where: { userId: session.user.id, provider: 'github' },
    })

    if (!githubAccount?.access_token) {
      return NextResponse.redirect(new URL('/learning-sources?error=no_github', request.url))
    }

    // Fetch calendar events and write to vault
    try {
      const calendarClient = new CalendarClient(
        tokens.access_token,
        tokens.refresh_token
      )

      const calendarEmail = await calendarClient.getUserCalendarEmail()
      const events = await calendarClient.fetchEvents(50)
      const githubClient = new GitHubClient(githubAccount.access_token)

      // Format events for vault
      const eventsContent = events
        .map(event => calendarClient.formatEventForVault(event))
        .join('\n\n---\n\n')

      // Write to vault
      await githubClient.writeFileToVault(
        setupState.vaultRepoName,
        'integrations/calendar/events.md',
        `# Google Calendar Events

*Last synced: ${new Date().toISOString()}*
*Calendar: ${calendarEmail}*

${eventsContent}
`,
        'Sync calendar events to vault'
      )

      // Create or update Integration record
      await prisma.integration.upsert({
        where: {
          userId_provider: {
            userId: session.user.id,
            provider: 'calendar',
          },
        },
        create: {
          userId: session.user.id,
          provider: 'calendar',
          status: 'connected',
          lastSyncedAt: new Date(),
          syncEnabled: true,
          metadata: JSON.stringify({ email: calendarEmail }),
        },
        update: {
          status: 'connected',
          lastSyncedAt: new Date(),
          syncEnabled: true,
          metadata: JSON.stringify({ email: calendarEmail }),
        },
      })

      return NextResponse.redirect(new URL('/learning-sources?calendar_connected=true', request.url))
    } catch (error: any) {
      console.error('Calendar sync error:', error)
      return NextResponse.redirect(new URL('/learning-sources?error=calendar_sync_failed', request.url))
    }

  } catch (error: any) {
    console.error('Calendar callback error:', error)
    return NextResponse.redirect(new URL('/learning-sources?error=calendar_callback_failed', request.url))
  }
}

