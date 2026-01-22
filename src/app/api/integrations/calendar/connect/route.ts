import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { GitHubClient } from '@/lib/github'
import { CalendarClient, getCalendarAuthUrl, getCalendarTokens } from '@/lib/calendar'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's setup state to find vault repo
    const setupState = await prisma.setupState.findUnique({
      where: { userId: session.user.id },
    })

    if (!setupState?.vaultRepoName) {
      return NextResponse.json(
        { error: 'Vault repository not found. Please complete setup first.' },
        { status: 400 }
      )
    }

    // Get GitHub access token for writing to vault
    const githubAccount = await prisma.account.findFirst({
      where: { userId: session.user.id, provider: 'github' },
    })

    if (!githubAccount?.access_token) {
      return NextResponse.json(
        { error: 'GitHub account not connected' },
        { status: 400 }
      )
    }

    // Check if Calendar is already connected
    const calendarAccount = await prisma.account.findFirst({
      where: { userId: session.user.id, provider: 'calendar' },
    })

    if (calendarAccount?.access_token) {
      // Calendar already connected, fetch and sync data
      try {
        const calendarClient = new CalendarClient(
          calendarAccount.access_token,
          calendarAccount.refresh_token || undefined
        )

        // Get user's calendar email
        const calendarEmail = await calendarClient.getUserCalendarEmail()

        // Fetch ALL events with pagination
        console.log('Fetching all calendar events...')
        const allEvents = await calendarClient.fetchAllEvents(100)
        console.log(`Fetched ${allEvents.length} total events`)

        const githubClient = new GitHubClient(githubAccount.access_token)

        // Batch events into files (50 per file)
        const batchSize = 50
        const batches: any[][] = []
        for (let i = 0; i < allEvents.length; i += batchSize) {
          batches.push(allEvents.slice(i, i + batchSize))
        }

        // Write each batch to a separate file
        const filePromises = batches.map(async (batch, index) => {
          const eventsContent = batch
            .map(event => calendarClient.formatEventForVault(event))
            .join('\n\n---\n\n')

          const fileName = index === 0 
            ? 'integrations/calendar/events.md'
            : `integrations/calendar/events-${index + 1}.md`

          return githubClient.writeFileToVault(
            setupState.vaultRepoName,
            fileName,
            `# Google Calendar Events (Batch ${index + 1} of ${batches.length})

*Last synced: ${new Date().toISOString()}*
*Total events: ${allEvents.length}*
*Events in this batch: ${batch.length}*

${eventsContent}
`,
            `Sync calendar events batch ${index + 1} to vault`
          )
        })

        await Promise.all(filePromises)

        // Create an index file
        await githubClient.writeFileToVault(
          setupState.vaultRepoName,
          'integrations/calendar/index.md',
          `# Google Calendar Integration

**Connected Calendar:** ${calendarEmail}
**Last Synced:** ${new Date().toISOString()}
**Total Events:** ${allEvents.length}
**Files:** ${batches.length}

## Event Files

${batches.map((_, index) => {
  const fileName = index === 0 ? 'events.md' : `events-${index + 1}.md`
  return `- [${fileName}](./${fileName}) - ${batches[index].length} events`
}).join('\n')}
`,
          'Create calendar integration index'
        )

        // Update Integration record
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

        return NextResponse.json({ 
          success: true,
          message: 'Calendar data synced to vault',
          eventCount: allEvents.length,
          email: calendarEmail
        })
      } catch (error: any) {
        console.error('Calendar sync error:', error)
        return NextResponse.json(
          { error: error.message || 'Failed to sync calendar data' },
          { status: 500 }
        )
      }
    }

    // Calendar not connected, return OAuth URL
    const authUrl = getCalendarAuthUrl()
    return NextResponse.json({ 
      authUrl,
      message: 'Calendar OAuth required'
    })

  } catch (error: any) {
    console.error('Calendar connect error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to connect Calendar' },
      { status: 500 }
    )
  }
}

