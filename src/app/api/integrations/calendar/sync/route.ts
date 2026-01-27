import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { GitHubClient } from '@/lib/github'
import { CalendarClient } from '@/lib/calendar'

/**
 * Sync Google Calendar events for all users with Calendar connected
 * This endpoint can be called by a cron job every 12 hours
 */
export async function POST(request: NextRequest) {
  try {
    // Optional: Add API key authentication for cron jobs
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get all users with Calendar connected and sync enabled
    const integrations = await prisma.integration.findMany({
      where: {
        provider: 'calendar',
        status: 'connected',
        syncEnabled: true,
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

    const results = []

    for (const integration of integrations) {
      try {
        const user = integration.user
        const calendarAccount = user.accounts.find((a: any) => a.provider === 'calendar')
        const githubAccount = user.accounts.find((a: any) => a.provider === 'github')
        const setupState = user.setup

        if (!calendarAccount?.access_token || !githubAccount?.access_token || !setupState?.vaultRepoName) {
          console.log(`Skipping user ${user.id}: missing credentials or vault`)
          continue
        }

        const calendarClient = new CalendarClient(
          calendarAccount.access_token,
          calendarAccount.refresh_token || undefined
        )

        // Get last sync date (default to 12 hours ago if never synced)
        const lastSyncDate = integration.lastSyncedAt 
          ? new Date(integration.lastSyncedAt)
          : new Date(Date.now() - 12 * 60 * 60 * 1000) // 12 hours ago

        console.log(`Syncing Calendar for user ${user.id} since ${lastSyncDate.toISOString()}`)

        // Fetch only new events since last sync
        // This will trigger token refresh if needed (OAuth2 client handles this automatically)
        const newEvents = await calendarClient.fetchNewEventsSince(lastSyncDate, 100)
        
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
          console.log(`Refreshed token for user ${user.id}`)
        }

        if (newEvents.length === 0) {
          console.log(`No new events for user ${user.id}`)
          // Update lastSyncedAt even if no new events
          await prisma.integration.update({
            where: { id: integration.id },
            data: { lastSyncedAt: new Date() },
          })
          results.push({ userId: user.id, status: 'success', eventCount: 0 })
          continue
        }

        console.log(`Found ${newEvents.length} new events for user ${user.id}`)

        const githubClient = new GitHubClient(githubAccount.access_token)
        const calendarEmail = await calendarClient.getUserCalendarEmail()

        // Batch new events into files (50 per file)
        const batchSize = 50
        const batches: any[][] = []
        for (let i = 0; i < newEvents.length; i += batchSize) {
          batches.push(newEvents.slice(i, i + batchSize))
        }

        // For incremental sync, create a file with timestamp for this sync batch
        const syncTimestamp = new Date().toISOString().replace(/[:.]/g, '-')
        
        const filePromises = batches.map(async (batch, index) => {
          const eventsContent = batch
            .map(event => calendarClient.formatEventForVault(event))
            .join('\n\n---\n\n')

          const fileName = batches.length === 1
            ? `integrations/calendar/new-events-${syncTimestamp}.md`
            : `integrations/calendar/new-events-${syncTimestamp}-${index + 1}.md`

          return githubClient.writeFileToVault(
            setupState.vaultRepoName!,
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

        // Update the sync log to append new sync entry
        try {
          const syncLogPath = 'integrations/calendar/sync-log.md'
          const existingLog = await githubClient.readFileFromVault(setupState.vaultRepoName!, syncLogPath)
          
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
            setupState.vaultRepoName!,
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

        results.push({
          userId: user.id,
          status: 'success',
          eventCount: newEvents.length,
          email: calendarEmail,
        })

        console.log(`Successfully synced ${newEvents.length} events for user ${user.id}`)
      } catch (error: any) {
        console.error(`Error syncing Calendar for user ${integration.userId}:`, error)
        results.push({
          userId: integration.userId,
          status: 'error',
          error: error.message,
        })
      }
    }

    return NextResponse.json({
      success: true,
      syncedUsers: results.length,
      results,
    })

  } catch (error: any) {
    console.error('Calendar sync job error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to run sync job' },
      { status: 500 }
    )
  }
}

