import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { vmProvider } = await request.json()

    if (!vmProvider || !['orgo', 'flyio', 'aws'].includes(vmProvider)) {
      return NextResponse.json({ error: 'Invalid VM provider' }, { status: 400 })
    }

    // Get or create setup state
    const setupState = await prisma.setupState.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        vmProvider,
        status: 'pending',
      },
      update: {
        vmProvider,
      },
    })

    return NextResponse.json({ 
      success: true, 
      vmProvider: setupState.vmProvider 
    })

  } catch (error) {
    console.error('Select VM error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save VM provider selection' },
      { status: 500 }
    )
  }
}
