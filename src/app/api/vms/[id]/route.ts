import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { OrgoClient } from '@/lib/orgo'
import { AWSClient } from '@/lib/aws'
import { E2BClient } from '@/lib/e2b'
import { decrypt } from '@/lib/encryption'
import type { SetupState } from '@prisma/client'

/**
 * GET /api/vms/[id] - Get a specific VM
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const vm = await prisma.vM.findFirst({
      where: {
        id: params.id,
        userId: session.user.id,
      },
    })

    if (!vm) {
      return NextResponse.json({ error: 'VM not found' }, { status: 404 })
    }

    return NextResponse.json({ vm })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get VM' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/vms/[id] - Update a VM
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    // Check if the VM belongs to the user
    const existingVM = await prisma.vM.findFirst({
      where: {
        id: params.id,
        userId: session.user.id,
      },
    })

    if (!existingVM) {
      return NextResponse.json({ error: 'VM not found' }, { status: 404 })
    }

    const vm = await prisma.vM.update({
      where: { id: params.id },
      data: body,
    })

    return NextResponse.json({ success: true, vm })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update VM' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/vms/[id] - Delete a VM and its associated cloud resource
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if the VM belongs to the user
    const existingVM = await prisma.vM.findFirst({
      where: {
        id: params.id,
        userId: session.user.id,
      },
    })

    if (!existingVM) {
      return NextResponse.json({ error: 'VM not found' }, { status: 404 })
    }

    // Get setup state to retrieve API keys
    const setupState = await prisma.setupState.findUnique({
      where: { userId: session.user.id },
    })

    // Delete the cloud resource based on provider
    if (existingVM.provider === 'orgo' && existingVM.orgoComputerId) {
      try {
        // Get Orgo API key from setup state (encrypted) or environment variable
        const orgoApiKeyEncrypted = setupState?.orgoApiKey
        const orgoApiKeyEnv = process.env.ORGO_API_KEY
        
        // Decrypt stored key or use env variable (which is not encrypted)
        const orgoApiKey = orgoApiKeyEncrypted ? decrypt(orgoApiKeyEncrypted) : orgoApiKeyEnv
        
        if (orgoApiKey) {
          const orgoClient = new OrgoClient(orgoApiKey)
          await orgoClient.deleteComputer(existingVM.orgoComputerId)
        }
      } catch (error: any) {
        // Continue with deletion even if cloud resource deletion fails
      }
    } else if (existingVM.provider === 'aws' && existingVM.awsInstanceId) {
      try {
        const awsState = setupState as SetupState & { 
          awsAccessKeyId?: string
          awsSecretAccessKey?: string
          awsRegion?: string
        }
        // Decrypt the encrypted AWS credentials
        const awsAccessKeyIdEncrypted = awsState?.awsAccessKeyId
        const awsSecretAccessKeyEncrypted = awsState?.awsSecretAccessKey
        const awsRegion = existingVM.awsRegion || awsState?.awsRegion || 'us-east-1'

        if (awsAccessKeyIdEncrypted && awsSecretAccessKeyEncrypted) {
          const awsClient = new AWSClient({
            accessKeyId: decrypt(awsAccessKeyIdEncrypted),
            secretAccessKey: decrypt(awsSecretAccessKeyEncrypted),
            region: awsRegion,
          })
          await awsClient.terminateInstance(existingVM.awsInstanceId)
        } else {
        }
      } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        // Continue with deletion even if cloud resource deletion fails
      }
    } else if (existingVM.provider === 'e2b' && existingVM.e2bSandboxId) {
      try {
        const e2bState = setupState as SetupState & { e2bApiKey?: string }
        // Decrypt the encrypted E2B API key or use env variable
        const e2bApiKeyEncrypted = e2bState?.e2bApiKey
        const e2bApiKeyEnv = process.env.E2B_API_KEY
        const e2bApiKey = e2bApiKeyEncrypted ? decrypt(e2bApiKeyEncrypted) : e2bApiKeyEnv
        
        if (e2bApiKey) {
          const e2bClient = new E2BClient(e2bApiKey)
          // E2B sandboxes are ephemeral and auto-terminate, but we can try to kill it
          // Note: We need the sandbox object, but we only have the ID. E2B sandboxes typically
          // auto-terminate after their timeout, so this is optional.
        } else {
        }
      } catch (error: any) {
        // Continue with deletion even if cloud resource deletion fails
      }
    }

    // Delete the VM record from database
    await prisma.vM.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete VM' },
      { status: 500 }
    )
  }
}
