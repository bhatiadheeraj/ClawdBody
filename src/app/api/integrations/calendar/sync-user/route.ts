import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { GitHubClient } from '@/lib/github'
import { CalendarClient } from '@/lib/calendar'

/**
 * Sync Google Calendar events for the current user
 * This endpoint is called when user clicks "Resync" button
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's integration
    const integration = await prisma.integration.findUnique({
      where: {
        userId_provider: {
          userId: session.user.id,
          provider: 'calendar',
        },
      },
      include: {
        user: {
          include: {
            accounts: true,
            setup: true,
          },
        },
      },
    })

    if (!integration || integration.status !== 'connected') {
      return NextResponse.json(
        { error: 'Calendar not connected' },
        { status: 400 }
      )
    }

    const user = integration.user
    const calendarAccount = user.accounts.find((a: any) => a.provider === 'calendar')
    const githubAccount = user.accounts.find((a: any) => a.provider === 'github')
    const setupState = user.setup

    if (!calendarAccount?.access_token || !githubAccount?.access_token || !setupState?.vaultRepoName) {
      return NextResponse.json(
        { error: 'Missing credentials or vault' },
        { status: 400 }
      )
    }

    const calendarClient = new CalendarClient(
      calendarAccount.access_token,
      calendarAccount.refresh_token || undefined
    )

    // Get user calendar email first (this will trigger token refresh if needed)
    const calendarEmail = await calendarClient.getUserCalendarEmail()
    
    // Check if token was refreshed and update if needed
    const credentials = calendarClient.getCredentials()
    if (credentials.access_token && credentials.access_token !== calendarAccount.access_token) {
      await prisma.account.update({
        where: { id: calendarAccount.id },
        data: {
          access_token: credentials.access_token,
          expires_at: credentials.expiry_date 
            ? Math.floor(credentials.expiry_date / 1000)
            : null,
        },
      })
    }

    // Get last sync date (default to 12 hours ago if never synced)
    const lastSyncDate = integration.lastSyncedAt 
      ? new Date(integration.lastSyncedAt)
      : new Date(Date.now() - 12 * 60 * 60 * 1000) // 12 hours ago

    console.log(`Syncing Calendar for user ${user.id} since ${lastSyncDate.toISOString()}`)

    // Fetch only new events since last sync
    const newEvents = await calendarClient.fetchNewEventsSince(lastSyncDate, 100)

    if (newEvents.length === 0) {
      // Update lastSyncedAt even if no new events
      await prisma.integration.update({
        where: { id: integration.id },
        data: { lastSyncedAt: new Date() },
      })
      
      return NextResponse.json({
        success: true,
        message: 'No new events to sync',
        eventCount: 0,
      })
    }

    console.log(`Found ${newEvents.length} new events for user ${user.id}`)

    const githubClient = new GitHubClient(githubAccount.access_token)

    // Batch new events into files (50 per file)
    const batchSize = 50
    const batches: any[][] = []
    for (let i = 0; i < newEvents.length; i += batchSize) {
      batches.push(newEvents.slice(i, i + batchSize))
    }

    // Create timestamped files for this sync
    const syncTimestamp = new Date().toISOString().replace(/[:.]/g, '-')
    
    const filePromises = batches.map(async (batch, index) => {
      const eventsContent = batch
        .map(event => calendarClient.formatEventForVault(event))
        .join('\n\n---\n\n')

      const fileName = batches.length === 1
        ? `integrations/calendar/new-events-${syncTimestamp}.md`
        : `integrations/calendar/new-events-${syncTimestamp}-${index + 1}.md`

      return githubClient.writeFileToVault(
        setupState.vaultRepoName,
        fileName,
        `# New Google Calendar Events (Sync: ${new Date().toISOString()})

*Sync batch: ${index + 1} of ${batches.length}*
*Events in this batch: ${batch.length}*

${eventsContent}
`,
        `Sync new calendar events batch ${index + 1} (${newEvents.length} total)`
      )
    })

    await Promise.all(filePromises)

    // Update the sync log
    try {
      const syncLogPath = 'integrations/calendar/sync-log.md'
      const existingLog = await githubClient.readFileFromVault(setupState.vaultRepoName, syncLogPath)
      
      const syncEntry = `- **${new Date().toISOString()}**: ${newEvents.length} new events synced (${batches.length} file${batches.length > 1 ? 's' : ''} created)`
      
      const newLogContent = existingLog
        ? existingLog.replace(
            /## Sync History\n/g,
            `## Sync History\n${syncEntry}\n`
          )
        : `# Google Calendar Sync Log

*Last updated: ${new Date().toISOString()}*

## Latest Sync
- **Date:** ${new Date().toISOString()}
- **New Events:** ${newEvents.length}
- **Files Created:** ${batches.length}

## Sync History
${syncEntry}
`

      await githubClient.writeFileToVault(
        setupState.vaultRepoName,
        syncLogPath,
        newLogContent,
        'Update calendar sync log'
      )
    } catch (e) {
      console.error('Error updating sync log:', e)
    }

    // Update Integration record
    await prisma.integration.update({
      where: { id: integration.id },
      data: {
        lastSyncedAt: new Date(),
        metadata: JSON.stringify({ 
          email: calendarEmail,
          lastEventCount: newEvents.length,
        }),
      },
    })

    return NextResponse.json({
      success: true,
      message: `Synced ${newEvents.length} new events`,
      eventCount: newEvents.length,
      email: calendarEmail,
    })

  } catch (error: any) {
    console.error('Calendar user sync error:', error)
    console.error('Error stack:', error?.stack)
    console.error('Error details:', {
      message: error?.message,
      name: error?.name,
      code: error?.code,
    })
    return NextResponse.json(
      { 
        error: error?.message || 'Failed to sync Calendar',
        details: process.env.NODE_ENV === 'development' ? error?.stack : undefined
      },
      { status: 500 }
    )
  }
}

