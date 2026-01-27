import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { GitHubClient } from '@/lib/github'
import { GmailClient } from '@/lib/gmail'

/**
 * Sync Gmail messages for the current user
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
          provider: 'gmail',
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
        { error: 'Gmail not connected' },
        { status: 400 }
      )
    }

    const user = integration.user
    const gmailAccount = user.accounts.find((a: any) => a.provider === 'gmail')
    const githubAccount = user.accounts.find((a: any) => a.provider === 'github')
    const setupState = user.setup

    if (!gmailAccount?.access_token || !githubAccount?.access_token || !setupState?.vaultRepoName) {
      return NextResponse.json(
        { error: 'Missing credentials or vault' },
        { status: 400 }
      )
    }

    const gmailClient = new GmailClient(
      gmailAccount.access_token,
      gmailAccount.refresh_token || undefined
    )

    // Get user email first (this will trigger token refresh if needed)
    // The OAuth2 client automatically refreshes tokens when making API calls
    const userEmail = await gmailClient.getUserEmail()
    
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
    }

    // Get last sync date (default to 12 hours ago if never synced)
    const lastSyncDate = integration.lastSyncedAt 
      ? new Date(integration.lastSyncedAt)
      : new Date(Date.now() - 12 * 60 * 60 * 1000) // 12 hours ago

    console.log(`Syncing Gmail for user ${user.id} since ${lastSyncDate.toISOString()}`)

    // Fetch only new messages since last sync (limit to 50 to avoid quota issues)
    const newMessages = await gmailClient.fetchNewMessagesSince(lastSyncDate, 50, 50)

    if (newMessages.length === 0) {
      // Update lastSyncedAt even if no new messages
      await prisma.integration.update({
        where: { id: integration.id },
        data: { lastSyncedAt: new Date() },
      })
      
      return NextResponse.json({
        success: true,
        message: 'No new messages to sync',
        messageCount: 0,
      })
    }

    console.log(`Found ${newMessages.length} new messages for user ${user.id}`)

    const githubClient = new GitHubClient(githubAccount.access_token)
    // userEmail already fetched above

    // Batch new messages into files (50 per file)
    const batchSize = 50
    const batches: any[][] = []
    for (let i = 0; i < newMessages.length; i += batchSize) {
      batches.push(newMessages.slice(i, i + batchSize))
    }

    // Create timestamped files for this sync
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

    // Update the sync log
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

    return NextResponse.json({
      success: true,
      message: `Synced ${newMessages.length} new messages`,
      messageCount: newMessages.length,
      email: userEmail,
    })

  } catch (error: any) {
    console.error('Gmail user sync error:', error)
    console.error('Error stack:', error?.stack)
    console.error('Error details:', {
      message: error?.message,
      name: error?.name,
      code: error?.code,
    })
    return NextResponse.json(
      { 
        error: error?.message || 'Failed to sync Gmail',
        details: process.env.NODE_ENV === 'development' ? error?.stack : undefined
      },
      { status: 500 }
    )
  }
}

