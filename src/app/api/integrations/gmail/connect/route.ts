import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { GitHubClient } from '@/lib/github'
import { GmailClient, getGmailAuthUrl, getGmailTokens } from '@/lib/gmail'

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
      console.error(`Gmail connect: Missing vault repository for user ${session.user.id}`)
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
      console.error(`Gmail connect: Missing GitHub account for user ${session.user.id}`)
      return NextResponse.json(
        { error: 'GitHub account not connected' },
        { status: 400 }
      )
    }

    // Check if Gmail is already connected
    const gmailAccount = await prisma.account.findFirst({
      where: { userId: session.user.id, provider: 'gmail' },
    })

    if (gmailAccount?.access_token) {
      // Gmail already connected, fetch and sync data
      try {
        const gmailClient = new GmailClient(
          gmailAccount.access_token,
          gmailAccount.refresh_token || undefined
        )

        // Get user's email address
        const userEmail = await gmailClient.getUserEmail()

        // Fetch messages (limit to 50 to avoid quota issues)
        console.log('Fetching Gmail messages...')
        const allMessages = await gmailClient.fetchAllMessages(50, 50)
        console.log(`Fetched ${allMessages.length} total messages`)

        const githubClient = new GitHubClient(githubAccount.access_token)

        // Batch messages into files (50 per file)
        const batchSize = 50
        const batches: any[][] = []
        for (let i = 0; i < allMessages.length; i += batchSize) {
          batches.push(allMessages.slice(i, i + batchSize))
        }

        // Write each batch to a separate file
        const filePromises = batches.map(async (batch, index) => {
          const messagesContent = batch
            .map(msg => gmailClient.formatMessageForVault(msg))
            .join('\n\n---\n\n')

          const fileName = index === 0 
            ? 'integrations/gmail/messages.md'
            : `integrations/gmail/messages-${index + 1}.md`

          return githubClient.writeFileToVault(
            setupState.vaultRepoName,
            fileName,
            `# Gmail Messages (Batch ${index + 1} of ${batches.length})

*Last synced: ${new Date().toISOString()}*
*Total messages: ${allMessages.length}*
*Messages in this batch: ${batch.length}*

${messagesContent}
`,
            `Sync Gmail messages batch ${index + 1} to vault`
          )
        })

        await Promise.all(filePromises)

        // Create an index file
        await githubClient.writeFileToVault(
          setupState.vaultRepoName,
          'integrations/gmail/index.md',
          `# Gmail Integration

**Connected Email:** ${userEmail}
**Last Synced:** ${new Date().toISOString()}
**Total Messages:** ${allMessages.length}
**Files:** ${batches.length}

## Message Files

${batches.map((_, index) => {
  const fileName = index === 0 ? 'messages.md' : `messages-${index + 1}.md`
  return `- [${fileName}](./${fileName}) - ${batches[index].length} messages`
}).join('\n')}
`,
          'Create Gmail integration index'
        )

        // Update Integration record
        await prisma.integration.upsert({
          where: {
            userId_provider: {
              userId: session.user.id,
              provider: 'gmail',
            },
          },
          create: {
            userId: session.user.id,
            provider: 'gmail',
            status: 'connected',
            lastSyncedAt: new Date(),
            syncEnabled: true,
            metadata: JSON.stringify({ email: userEmail }),
          },
          update: {
            status: 'connected',
            lastSyncedAt: new Date(),
            syncEnabled: true,
            metadata: JSON.stringify({ email: userEmail }),
          },
        })

        return NextResponse.json({ 
          success: true,
          message: 'Gmail data synced to vault',
          messageCount: allMessages.length,
          email: userEmail
        })
      } catch (error: any) {
        console.error('Gmail sync error:', error)
        return NextResponse.json(
          { error: error.message || 'Failed to sync Gmail data' },
          { status: 500 }
        )
      }
    }

    // Gmail not connected, return OAuth URL
    const authUrl = getGmailAuthUrl()
    return NextResponse.json({ 
      authUrl,
      message: 'Gmail OAuth required'
    })

  } catch (error: any) {
    console.error('Gmail connect error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to connect Gmail' },
      { status: 500 }
    )
  }
}

