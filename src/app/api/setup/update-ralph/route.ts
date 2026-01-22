import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { OrgoClient } from '@/lib/orgo'

const RALPH_GIST_URL = 'https://gist.githubusercontent.com/Prakshal-Jain/660d4b056a0f2554a663a171fda40c9f/raw/9840198380b8d0bae3b7397caf6519be3644b45c/ralph_wiggum.py'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orgoApiKey = process.env.ORGO_API_KEY
    if (!orgoApiKey) {
      return NextResponse.json({ error: 'Orgo API key not configured' }, { status: 500 })
    }

    // Get setup state for this user
    const setupState = await prisma.setupState.findUnique({
      where: { userId: session.user.id },
    })

    if (!setupState?.orgoComputerId) {
      return NextResponse.json({ error: 'No computer found. Please run setup first.' }, { status: 404 })
    }

    const orgoClient = new OrgoClient(orgoApiKey)
    const computerId = setupState.orgoComputerId

    const steps: string[] = []

    // Step 1: Install Pillow
    steps.push('Installing Pillow...')
    const pillowResult = await orgoClient.bash(
      computerId,
      'pip3 install Pillow --break-system-packages'
    )
    if (pillowResult.exit_code !== 0) {
      steps.push(`Warning: Pillow installation may have issues: ${pillowResult.output}`)
    } else {
      steps.push('✓ Pillow installed')
    }

    // Step 2: Stop existing Ralph processes
    steps.push('Stopping existing Ralph processes...')
    const stopResult = await orgoClient.bash(
      computerId,
      'killall -9 python3 2>/dev/null; rm -f /tmp/ralph_task.lock; echo "Stopped"'
    )
    steps.push('✓ Processes stopped')

    // Step 3: Download updated Ralph script
    steps.push('Downloading updated Ralph script...')
    const downloadResult = await orgoClient.bash(
      computerId,
      `curl -fsSL "${RALPH_GIST_URL}" -o ~/ralph_wiggum.py && chmod +x ~/ralph_wiggum.py && head -5 ~/ralph_wiggum.py`
    )
    if (downloadResult.exit_code !== 0) {
      return NextResponse.json({ 
        error: 'Failed to download Ralph script',
        steps,
        output: downloadResult.output
      }, { status: 500 })
    }
    steps.push('✓ Script downloaded')

    // Step 4: Verify Pillow
    steps.push('Verifying Pillow...')
    const verifyPillow = await orgoClient.bash(
      computerId,
      'python3 -c "import PIL; print(\'Pillow OK\')"'
    )
    if (verifyPillow.exit_code === 0) {
      steps.push('✓ Pillow verified')
    }

    // Step 5: Restart Ralph
    steps.push('Starting Ralph...')
    const startResult = await orgoClient.bash(
      computerId,
      '(bash -c "~/start-ralph.sh >/dev/null 2>&1 &") && sleep 2 && echo "Started"'
    )
    steps.push('✓ Ralph started')

    // Step 6: Verify Ralph is running
    const checkResult = await orgoClient.bash(
      computerId,
      'ps aux | grep -E "[r]alph_wiggum.py" && echo "✓ Running" || echo "Not found"'
    )
    steps.push(checkResult.output.includes('✓') ? '✓ Ralph is running' : '⚠ Ralph process not visible yet')

    return NextResponse.json({
      success: true,
      message: 'Ralph updated and restarted',
      steps,
      logCommand: 'tail -f ~/ralph_wiggum.log'
    })

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}

