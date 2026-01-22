import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get all integrations for the user
    const integrations = await prisma.integration.findMany({
      where: { userId: session.user.id },
    })

    // Get accounts for additional info (like email addresses)
    const accounts = await prisma.account.findMany({
      where: { 
        userId: session.user.id,
        provider: { in: ['gmail', 'calendar', 'slack', 'github'] }
      },
    })

    // Build status object
    const status: Record<string, { connected: boolean; pending?: boolean; email?: string; lastSyncedAt?: string; repositories?: string[]; repositoryCount?: number }> = {}
    
    integrations.forEach(integration => {
      status[integration.provider] = {
        connected: integration.status === 'connected',
        pending: integration.status === 'pending',
        lastSyncedAt: integration.lastSyncedAt?.toISOString(),
      }

      // Try to get email from metadata or account
      if (integration.metadata) {
        try {
          const metadata = JSON.parse(integration.metadata)
          if (metadata.email) {
            status[integration.provider].email = metadata.email
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    })

    // For Gmail and Calendar, also check account table for email
    const gmailAccount = accounts.find(a => a.provider === 'gmail')
    if (gmailAccount && gmailAccount.providerAccountId && !status.gmail?.email) {
      status.gmail = status.gmail || { connected: false }
      status.gmail.email = gmailAccount.providerAccountId.includes('@') 
        ? gmailAccount.providerAccountId 
        : undefined
    }

    const calendarAccount = accounts.find(a => a.provider === 'calendar')
    if (calendarAccount && calendarAccount.providerAccountId && !status.calendar?.email) {
      status.calendar = status.calendar || { connected: false }
      status.calendar.email = calendarAccount.providerAccountId.includes('@') 
        ? calendarAccount.providerAccountId 
        : undefined
    }

    // For GitHub, try to get repository count from metadata (whether connected or pending)
    if (status.github?.connected || status.github?.pending) {
      try {
        const githubIntegration = integrations.find(i => i.provider === 'github')
        if (githubIntegration?.metadata) {
          const metadata = JSON.parse(githubIntegration.metadata)
          if (metadata.repositories) {
            status.github.repositories = metadata.repositories
            status.github.repositoryCount = metadata.repositories.length
            if (metadata.pending) {
              status.github.pending = true
            }
          }
        }
      } catch (e) {
        // Ignore parse errors
      }
    }

    return NextResponse.json({ status })

  } catch (error: any) {
    console.error('Integration status error:', error)
    return NextResponse.json(
      { error: 'Failed to get integration status' },
      { status: 500 }
    )
  }
}

