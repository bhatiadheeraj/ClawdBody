import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { GitHubClient } from '@/lib/github'
import { GmailClient, getGmailTokens } from '@/lib/gmail'

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
      return NextResponse.redirect(new URL('/learning-sources?error=gmail_auth_failed', request.url))
    }

    if (!code) {
      return NextResponse.redirect(new URL('/learning-sources?error=no_code', request.url))
    }

    // Exchange code for tokens
    const tokens = await getGmailTokens(code)

    // Store Gmail account in database
    await prisma.account.upsert({
      where: {
        provider_providerAccountId: {
          provider: 'gmail',
          providerAccountId: session.user.email || session.user.id,
        },
      },
      create: {
        userId: session.user.id,
        type: 'oauth',
        provider: 'gmail',
        providerAccountId: session.user.email || session.user.id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expires_in ? Math.floor(Date.now() / 1000) + tokens.expires_in : null,
        token_type: 'Bearer',
        scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.compose',
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

    // Fetch Gmail messages and write to vault
    try {
      const gmailClient = new GmailClient(
        tokens.access_token,
        tokens.refresh_token
      )

      const messages = await gmailClient.fetchMessages(50)
      const githubClient = new GitHubClient(githubAccount.access_token)

      // Format messages for vault
      const messagesContent = messages
        .map(msg => gmailClient.formatMessageForVault(msg))
        .join('\n\n---\n\n')

      // Write to vault
      await githubClient.writeFileToVault(
        setupState.vaultRepoName!,
        'integrations/gmail/messages.md',
        `# Gmail Messages

*Last synced: ${new Date().toISOString()}*

${messagesContent}
`,
        'Sync Gmail messages to vault'
      )

      // Create or update Integration record
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
        },
        update: {
          status: 'connected',
          lastSyncedAt: new Date(),
          syncEnabled: true,
        },
      })

      return NextResponse.redirect(new URL('/learning-sources?gmail_connected=true', request.url))
    } catch (error: any) {
      console.error('Gmail sync error:', error)
      return NextResponse.redirect(new URL('/learning-sources?error=gmail_sync_failed', request.url))
    }

  } catch (error: any) {
    console.error('Gmail callback error:', error)
    return NextResponse.redirect(new URL('/learning-sources?error=gmail_callback_failed', request.url))
  }
}

