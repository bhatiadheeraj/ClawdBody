import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { OrgoClient } from '@/lib/orgo'
import { AWSClient } from '@/lib/aws'
import { decrypt } from '@/lib/encryption'
import type { SetupState } from '@prisma/client'

// Extended type for AWS fields (may be missing from cached Prisma types)
type AWSSetupState = SetupState & {
  awsAccessKeyId?: string | null
  awsSecretAccessKey?: string | null
  awsRegion?: string | null
  awsInstanceType?: string | null
  awsInstanceId?: string | null
  awsInstanceName?: string | null
  awsPublicIp?: string | null
  awsPrivateKey?: string | null
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if vmId is provided in the request body
    const body = await request.json().catch(() => ({}))
    const vmId = body.vmId

    let vmProvider = 'orgo'
    let computerId: string | null = null
    let instanceId: string | null = null
    let sandboxId: string | null = null
    let awsRegion: string | null = null

    // If vmId is provided, get the VM to determine provider and resource IDs
    let vm: any = null
    if (vmId) {
      vm = await prisma.vM.findFirst({
        where: { id: vmId, userId: session.user.id },
      })

      if (!vm) {
        return NextResponse.json({ error: 'VM not found' }, { status: 404 })
      }

      vmProvider = vm.provider
      computerId = vm.orgoComputerId || null
      instanceId = vm.awsInstanceId || null
      sandboxId = vm.e2bSandboxId || null
      awsRegion = vm.awsRegion || null
    }

    // Get setup state to find computer ID (fallback if no vmId)
    const setupState = await prisma.setupState.findUnique({
      where: { userId: session.user.id },
    })

    if (!vmId) {
      vmProvider = setupState?.vmProvider || 'orgo'
      computerId = setupState?.orgoComputerId || null
      instanceId = (setupState as any)?.awsInstanceId || null
    }

    // Delete based on provider
    if (vmProvider === 'aws') {
      // Use instanceId from VM if available, otherwise from setupState
      const finalInstanceId = instanceId || (setupState as AWSSetupState)?.awsInstanceId
      
      if (!finalInstanceId) {
        return NextResponse.json({ error: 'No EC2 instance to delete' }, { status: 404 })
      }

      const awsState = setupState as AWSSetupState
      const awsAccessKeyIdEncrypted = awsState?.awsAccessKeyId
      const awsSecretAccessKeyEncrypted = awsState?.awsSecretAccessKey
      const finalAwsRegion = awsRegion || awsState?.awsRegion || 'us-east-1'

      if (!awsAccessKeyIdEncrypted || !awsSecretAccessKeyEncrypted) {
        return NextResponse.json({ error: 'AWS credentials not configured' }, { status: 500 })
      }

      // Decrypt stored AWS credentials
      const awsClient = new AWSClient({
        accessKeyId: decrypt(awsAccessKeyIdEncrypted),
        secretAccessKey: decrypt(awsSecretAccessKeyEncrypted),
        region: finalAwsRegion,
      })

      try {
        await awsClient.terminateInstance(finalInstanceId)
        console.log(`Successfully terminated AWS EC2 instance: ${finalInstanceId}`)
      } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        if (errorMessage.includes('not found') || errorMessage.includes('InvalidInstanceID')) {
          console.log(`EC2 instance ${finalInstanceId} already terminated, continuing with state reset`)
        } else {
          console.warn(`Error terminating EC2 instance (will still reset state):`, errorMessage)
        }
      }

      // Delete VM record if vmId was provided
      if (vmId) {
        await prisma.vM.delete({ where: { id: vmId } })
      } else {
        // Reset AWS-specific state using raw query to bypass TypeScript (backward compatibility)
        await prisma.$executeRaw`
          UPDATE SetupState SET 
            status = 'pending',
            awsInstanceId = NULL,
            awsInstanceName = NULL,
            awsPublicIp = NULL,
            awsPrivateKey = NULL,
            vmStatus = NULL,
            vmCreated = 0,
            clawdbotInstalled = 0,
            telegramConfigured = 0,
            gatewayStarted = 0,
            errorMessage = NULL
          WHERE userId = ${session.user.id}
        `
      }
    } else if (vmProvider === 'e2b') {
      // E2B sandboxes are ephemeral and auto-terminate after timeout
      // No explicit deletion needed, but we can log it
      if (sandboxId) {
        console.log(`E2B sandbox ${sandboxId} will auto-terminate after timeout`)
      }
      
      // Delete VM record if vmId was provided
      if (vmId) {
        await prisma.vM.delete({ where: { id: vmId } })
      }
      
      return NextResponse.json({ 
        success: true,
        message: 'E2B sandbox will auto-terminate after timeout'
      })
    } else {
      // Orgo deletion
      const finalComputerId = computerId || setupState?.orgoComputerId
      
      if (!finalComputerId) {
        return NextResponse.json({ error: 'No computer to delete' }, { status: 404 })
      }

      // Use user's Orgo API key or fallback to environment
      const orgoApiKeyEncrypted = setupState?.orgoApiKey
      const orgoApiKeyEnv = process.env.ORGO_API_KEY
      if (!orgoApiKeyEncrypted && !orgoApiKeyEnv) {
        return NextResponse.json({ error: 'Orgo API key not configured' }, { status: 500 })
      }

      // Decrypt stored key or use env variable (which is not encrypted)
      const orgoApiKey = orgoApiKeyEncrypted ? decrypt(orgoApiKeyEncrypted) : orgoApiKeyEnv!
      const orgoClient = new OrgoClient(orgoApiKey)

      try {
        await orgoClient.deleteComputer(finalComputerId)
        console.log(`Successfully deleted Orgo computer: ${finalComputerId}`)
      } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        if (errorMessage.includes('404') || errorMessage.includes('not found') || errorMessage.includes('Computer not found')) {
          console.log(`Computer ${finalComputerId} already deleted from Orgo (404), continuing with state reset`)
        } else {
          console.warn(`Error deleting computer from Orgo (will still reset state):`, errorMessage)
        }
      }

      // Delete VM record if vmId was provided
      if (vmId) {
        await prisma.vM.delete({ where: { id: vmId } })
      } else {
        // Reset Orgo-specific state in SetupState (backward compatibility)
        await prisma.setupState.update({
          where: { userId: session.user.id },
          data: {
            status: 'pending',
            orgoProjectId: null,
            orgoComputerId: null,
            orgoComputerUrl: null,
            vmStatus: null,
            vmCreated: false,
            clawdbotInstalled: false,
            telegramConfigured: false,
            gatewayStarted: false,
            errorMessage: null,
          },
        })
      }
    }

    return NextResponse.json({ 
      success: true,
      message: vmProvider === 'aws' ? 'EC2 instance terminated successfully' : 'Computer deleted successfully'
    })

  } catch (error) {
    console.error('Delete computer error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete computer' },
      { status: 500 }
    )
  }
}

