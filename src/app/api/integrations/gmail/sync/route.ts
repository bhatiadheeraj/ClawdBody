import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { GitHubClient } from '@/lib/github'
import { GmailClient } from '@/lib/gmail'

/**
 * Sync Gmail messages for all users with Gmail connected
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

    // Get all users with Gmail connected and sync enabled
    const integrations = await prisma.integration.findMany({
      where: {
        provider: 'gmail',
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
        const gmailAccount = user.accounts.find(a => a.provider === 'gmail')
        const githubAccount = user.accounts.find(a => a.provider === 'github')
        const setupState = user.setup

        if (!gmailAccount?.access_token || !githubAccount?.access_token || !setupState?.vaultRepoName) {
          console.log(`Skipping user ${user.id}: missing credentials or vault`)
          continue
        }

        const gmailClient = new GmailClient(
          gmailAccount.access_token,
          gmailAccount.refresh_token || undefined
        )

        // Get last sync date (default to 12 hours ago if never synced)
        const lastSyncDate = integration.lastSyncedAt 
          ? new Date(integration.lastSyncedAt)
          : new Date(Date.now() - 12 * 60 * 60 * 1000) // 12 hours ago

        console.log(`Syncing Gmail for user ${user.id} since ${lastSyncDate.toISOString()}`)

        // Fetch only new messages since last sync (limit to 50 to avoid quota issues)
        // This will trigger token refresh if needed (OAuth2 client handles this automatically)
        const newMessages = await gmailClient.fetchNewMessagesSince(lastSyncDate, 50, 50)
        
        // Check if token was refreshed and update if needed
        const credentials = gmailClient.getCredentials()
        if (credentials.access_token && credentials.access_token !== gmailAccount.access_token) {
          await prisma.account.update({
            where: { id: gmailAccount.id },
            data: {
              access_token: credentials.access_token,
              expires_at: credentials.expiry_date 
                ? Math.floor(credentials.expiry_date / 1000)
                : null,
            },
          })
          console.log(`Refreshed token for user ${user.id}`)
        }

        if (newMessages.length === 0) {
          console.log(`No new messages for user ${user.id}`)
          // Update lastSyncedAt even if no new messages
          await prisma.integration.update({
            where: { id: integration.id },
            data: { lastSyncedAt: new Date() },
          })
          results.push({ userId: user.id, status: 'success', messageCount: 0 })
          continue
        }

        console.log(`Found ${newMessages.length} new messages for user ${user.id}`)

        const githubClient = new GitHubClient(githubAccount.access_token)
        const userEmail = await gmailClient.getUserEmail()

        // Read existing index to get current file count
        let existingFileCount = 0
        try {
          // Try to read the index file to determine existing file count
          // For now, we'll append to the last file or create a new one
          // This is a simplified approach - in production, you might want to track this better
        } catch (e) {
          // Index file doesn't exist yet, start from 1
        }

        // Batch new messages into files (50 per file)
        const batchSize = 50
        const batches: any[][] = []
        for (let i = 0; i < newMessages.length; i += batchSize) {
          batches.push(newMessages.slice(i, i + batchSize))
        }

        // For incremental sync, we'll append to a "new-messages" file or create new batch files
        // Strategy: Create a file with timestamp for this sync batch
        const syncTimestamp = new Date().toISOString().replace(/[:.]/g, '-')
        
        const filePromises = batches.map(async (batch, index) => {
          const messagesContent = batch
            .map(msg => gmailClient.formatMessageForVault(msg))
            .join('\n\n---\n\n')

          const fileName = batches.length === 1
            ? `integrations/gmail/new-messages-${syncTimestamp}.md`
            : `integrations/gmail/new-messages-${syncTimestamp}-${index + 1}.md`

          return githubClient.writeFileToVault(
            setupState.vaultRepoName!,
            fileName,
            `# New Gmail Messages (Sync: ${new Date().toISOString()})

*Sync batch: ${index + 1} of ${batches.length}*
*Messages in this batch: ${batch.length}*

${messagesContent}
`,
            `Sync new Gmail messages batch ${index + 1} (${newMessages.length} total)`
          )
        })

        await Promise.all(filePromises)

        // Update the sync log to append new sync entry
        try {
          const syncLogPath = 'integrations/gmail/sync-log.md'
          const existingLog = await githubClient.readFileFromVault(setupState.vaultRepoName!, syncLogPath)
          
          const syncEntry = `- **${new Date().toISOString()}**: ${newMessages.length} new messages synced (${batches.length} file${batches.length > 1 ? 's' : ''} created)`
          
          const newLogContent = existingLog
            ? existingLog.replace(
                /## Sync History\n/g,
                `## Sync History\n${syncEntry}\n`
              )
            : `# Gmail Sync Log

*Last updated: ${new Date().toISOString()}*

## Latest Sync
- **Date:** ${new Date().toISOString()}
- **New Messages:** ${newMessages.length}
- **Files Created:** ${batches.length}

## Sync History
${syncEntry}
`

          await githubClient.writeFileToVault(
            setupState.vaultRepoName!,
            syncLogPath,
            newLogContent,
            'Update Gmail sync log'
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
              email: userEmail,
              lastMessageCount: newMessages.length,
            }),
          },
        })

        results.push({
          userId: user.id,
          status: 'success',
          messageCount: newMessages.length,
          email: userEmail,
        })

        console.log(`Successfully synced ${newMessages.length} messages for user ${user.id}`)
      } catch (error: any) {
        console.error(`Error syncing Gmail for user ${integration.userId}:`, error)
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
    console.error('Gmail sync job error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to run sync job' },
      { status: 500 }
    )
  }
}

