import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/encryption'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if a specific VM is requested
    const { searchParams } = new URL(request.url)
    const vmId = searchParams.get('vmId')

    let orgoComputerId: string | null = null

    // If vmId is provided, get the computer ID from the VM model
    if (vmId) {
      const vm = await prisma.vM.findFirst({
        where: { id: vmId, userId: session.user.id },
      })

      if (!vm) {
        return NextResponse.json({ error: 'VM not found' }, { status: 404 })
      }

      if (vm.provider !== 'orgo') {
        return NextResponse.json({ error: 'VNC only available for Orgo VMs' }, { status: 400 })
      }

      orgoComputerId = vm.orgoComputerId
    } else {
      // Fall back to SetupState for backward compatibility
      const setupState = await prisma.setupState.findUnique({
        where: { userId: session.user.id },
      })
      orgoComputerId = setupState?.orgoComputerId || null
    }

    if (!orgoComputerId) {
      return NextResponse.json({ error: 'VM not created yet' }, { status: 404 })
    }

    // Get Orgo API key from setup state or environment
    const setupState = await prisma.setupState.findUnique({
      where: { userId: session.user.id },
      select: { orgoApiKey: true },
    })
    
    const orgoApiKeyEncrypted = setupState?.orgoApiKey
    const orgoApiKeyEnv = process.env.ORGO_API_KEY
    if (!orgoApiKeyEncrypted && !orgoApiKeyEnv) {
      return NextResponse.json({ error: 'Orgo API key not configured' }, { status: 500 })
    }
    
    // Decrypt stored key or use env variable (which is not encrypted)
    const orgoApiKey = orgoApiKeyEncrypted ? decrypt(orgoApiKeyEncrypted) : orgoApiKeyEnv!

    // Fetch VNC password from Orgo API
    const ORGO_API_BASE = 'https://www.orgo.ai/api'
    
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout
    
    try {
      const response = await fetch(
        `${ORGO_API_BASE}/computers/${orgoComputerId}/vnc-password`,
        {
          signal: controller.signal,
          headers: {
            'Authorization': `Bearer ${orgoApiKey}`,
          },
        }
      )
      
      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        const status = response.status
        
        if (status === 502) {
          return NextResponse.json(
            { error: 'VM is not ready yet. Please wait a moment and try again.' },
            { status: 503 }
          )
        }
        
        if (status === 404) {
          return NextResponse.json(
            { error: 'Computer not found - it may have been deleted' },
            { status: 404 }
          )
        }
        
        throw new Error(`Failed to fetch VNC password: ${status}`)
      }

      const data = await response.json()
      
      // The hostname is [computer id].orgo.dev
      const hostname = `${orgoComputerId}.orgo.dev`
      
      return NextResponse.json({
        password: data.password,
        hostname,
        computerId: orgoComputerId,
      })
    } catch (fetchError: any) {
      clearTimeout(timeoutId)
      if (fetchError.name === 'AbortError' || fetchError.message?.includes('timeout')) {
        return NextResponse.json(
          { error: 'VNC password request timed out. The VM may still be starting up.' },
          { status: 504 }
        )
      }
      throw fetchError
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get VNC password' },
      { status: 500 }
    )
  }
}
