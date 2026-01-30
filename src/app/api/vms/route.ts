import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { OrgoClient, sanitizeName } from '@/lib/orgo'
import { AWSClient } from '@/lib/aws'
import { decrypt, encrypt } from '@/lib/encryption'

/**
 * GET /api/vms - List all VMs for the current user
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const vms = await prisma.vM.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
    })

    // Also get the setup state to check for stored credentials
    const setupState = await prisma.setupState.findUnique({
      where: { userId: session.user.id },
      select: {
        orgoApiKey: true,
        awsAccessKeyId: true,
        awsSecretAccessKey: true,
        awsRegion: true,
        e2bApiKey: true,
      },
    })

    // Return all VMs without auto-deleting
    // Note: We no longer auto-delete VMs based on Orgo API responses because:
    // 1. Newly created VMs might return 404 briefly while being provisioned
    // 2. Orgo API could be temporarily unavailable
    // 3. Users should manually delete VMs they no longer need
    const validVMs = vms

    return NextResponse.json({
      vms: validVMs,
      credentials: {
        hasOrgoApiKey: !!setupState?.orgoApiKey,
        hasAwsCredentials: !!(setupState?.awsAccessKeyId && setupState?.awsSecretAccessKey),
        awsRegion: setupState?.awsRegion || 'us-east-1',
        hasE2bApiKey: !!setupState?.e2bApiKey,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list VMs' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/vms - Create a new VM
 * For Orgo VMs with provisionNow=true, this will immediately provision the VM
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { 
      name, 
      provider, 
      provisionNow, // If true, provision Orgo VM immediately
      // Orgo specific
      orgoProjectId,
      orgoProjectName,
      orgoRam,
      orgoCpu,
      // AWS specific
      awsInstanceType,
      awsRegion,
      // E2B specific
      e2bTemplateId,
      e2bTimeout,
    } = body

    if (!name || !provider) {
      return NextResponse.json({ error: 'Name and provider are required' }, { status: 400 })
    }

    if (!['orgo', 'aws', 'flyio', 'e2b'].includes(provider)) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
    }

    // Sanitize the user's name for cloud provider compatibility
    const sanitizedName = sanitizeName(name)
    if (!sanitizedName) {
      return NextResponse.json({ error: 'Invalid name. Please use alphanumeric characters.' }, { status: 400 })
    }

    // Check if a VM with this name already exists for this user
    const existingVM = await prisma.vM.findFirst({
      where: {
        userId: session.user.id,
        name: { equals: name, mode: 'insensitive' },
      },
    })

    if (existingVM) {
      return NextResponse.json({ 
        error: `A VM named "${name}" already exists. Please choose a different name.`,
        code: 'DUPLICATE_NAME'
      }, { status: 400 })
    }

    // For VMs with provisionNow, create the cloud resource immediately
    let orgoComputerId: string | undefined
    let orgoComputerUrl: string | undefined
    let awsInstanceId: string | undefined
    let awsPublicIp: string | undefined
    let awsPrivateKey: string | undefined
    let vmStatus = 'pending'

    if (provider === 'orgo' && provisionNow) {
      // Get the Orgo API key from setup state
      const setupState = await prisma.setupState.findUnique({
        where: { userId: session.user.id },
        select: { orgoApiKey: true },
      })

      if (!setupState?.orgoApiKey) {
        return NextResponse.json({ error: 'Orgo API key not configured' }, { status: 400 })
      }

      // Decrypt the stored API key
      const orgoClient = new OrgoClient(decrypt(setupState.orgoApiKey))

      try {
        // Call Orgo API to create the computer using the user's sanitized name
        const computer = await orgoClient.createComputer(orgoProjectId, sanitizedName, {
          os: 'linux',
          ram: orgoRam as 1 | 2 | 4 | 8 | 16 | 32 | 64,
          cpu: orgoCpu as 1 | 2 | 4 | 8 | 16,
        })

        orgoComputerId = computer.id
        orgoComputerUrl = computer.url
        vmStatus = 'running'
        
      } catch (orgoError: any) {
        
        // Parse the error response from Orgo
        let errorMessage = orgoError.message || 'Failed to provision VM'
        let upgradeTier: string | undefined
        
        // Check if it's a plan limitation error
        if (errorMessage.includes('plan allows') || errorMessage.includes('requires')) {
          // Return the error with upgrade info
          return NextResponse.json({
            error: errorMessage,
            upgradeTier: 'pro', // Or parse from response if available
            needsUpgrade: true,
          }, { status: 400 })
        }
        
        return NextResponse.json({ error: errorMessage }, { status: 400 })
      }
    }

    // For AWS VMs with provisionNow, create the EC2 instance immediately
    if (provider === 'aws' && provisionNow) {
      // Get the AWS credentials from setup state
      const setupState = await prisma.setupState.findUnique({
        where: { userId: session.user.id },
        select: { 
          awsAccessKeyId: true,
          awsSecretAccessKey: true,
          awsRegion: true,
        },
      })

      if (!setupState?.awsAccessKeyId || !setupState?.awsSecretAccessKey) {
        return NextResponse.json({ error: 'AWS credentials not configured' }, { status: 400 })
      }

      try {
        // Decrypt the stored credentials
        const awsClient = new AWSClient({
          accessKeyId: decrypt(setupState.awsAccessKeyId),
          secretAccessKey: decrypt(setupState.awsSecretAccessKey),
          region: awsRegion || setupState.awsRegion || 'us-east-1',
        })

        // Create the EC2 instance
        console.log(`[AWS] Creating EC2 instance for user ${session.user.id}: ${sanitizedName}`)
        const { instance, privateKey } = await awsClient.createInstance({
          name: sanitizedName,
          instanceType: awsInstanceType || 'm7i-flex.large',
          region: awsRegion || setupState.awsRegion || 'us-east-1',
        })

        awsInstanceId = instance.id
        awsPublicIp = instance.publicIp
        awsPrivateKey = encrypt(privateKey) // Encrypt the private key before storing
        vmStatus = 'running'
        
        console.log(`[AWS] Successfully created EC2 instance ${awsInstanceId} with IP ${awsPublicIp}`)
      } catch (awsError: any) {
        console.error(`[AWS] Failed to provision EC2 instance:`, awsError)
        const errorMessage = awsError.message || 'Failed to provision AWS EC2 instance'
        return NextResponse.json({ error: errorMessage }, { status: 400 })
      }
    }

    // Create the VM record
    const vm = await prisma.vM.create({
      data: {
        userId: session.user.id,
        name,
        provider,
        status: vmStatus,
        vmCreated: (provider === 'orgo' && provisionNow && !!orgoComputerId) || 
                   (provider === 'aws' && provisionNow && !!awsInstanceId),
        // Orgo specific
        orgoProjectId,
        orgoProjectName,
        orgoRam,
        orgoCpu,
        orgoComputerId,
        orgoComputerUrl,
        // AWS specific
        awsInstanceType,
        awsRegion,
        awsInstanceId,
        awsPublicIp,
        awsPrivateKey,
        // E2B specific
        e2bTemplateId,
        e2bTimeout,
      },
    })

    return NextResponse.json({ success: true, vm })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create VM' },
      { status: 500 }
    )
  }
}
