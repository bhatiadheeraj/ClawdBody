#!/usr/bin/env ts-node
/**
 * Script to update Ralph Wiggum on the Orgo VM
 * Downloads latest from Gist, installs Pillow, and restarts Ralph
 */

import { PrismaClient } from '@prisma/client'
import { OrgoClient } from '../src/lib/orgo'

const prisma = new PrismaClient()
const RALPH_GIST_URL = 'https://gist.githubusercontent.com/Prakshal-Jain/660d4b056a0f2554a663a171fda40c9f/raw/9840198380b8d0bae3b7397caf6519be3644b45c/ralph_wiggum.py'

async function main() {
  try {
    // Get the latest setup state (you might want to add userId filtering)
    const setupStates = await prisma.setupState.findMany({
      orderBy: { createdAt: 'desc' },
      take: 1,
    })

    if (setupStates.length === 0) {
      console.error('No setup state found. Please run the setup first.')
      process.exit(1)
    }

    const setupState = setupStates[0]
    
    if (!setupState.orgoComputerId) {
      console.error('No computer ID found in setup state.')
      process.exit(1)
    }

    const orgoApiKey = process.env.ORGO_API_KEY
    if (!orgoApiKey) {
      console.error('ORGO_API_KEY not found in environment variables.')
      process.exit(1)
    }

    console.log(`Found computer: ${setupState.orgoComputerId}`)
    console.log('Updating Ralph Wiggum...\n')

    const orgoClient = new OrgoClient(orgoApiKey)
    const computerId = setupState.orgoComputerId

    // Step 1: Install Pillow
    console.log('1. Installing Pillow...')
    const pillowResult = await orgoClient.bash(
      computerId,
      'pip3 install Pillow --break-system-packages'
    )
    console.log(pillowResult.output)
    if (pillowResult.exit_code !== 0) {
      console.warn('Warning: Pillow installation may have failed')
    }

    // Step 2: Stop any running Ralph processes
    console.log('\n2. Stopping existing Ralph processes...')
    const stopResult = await orgoClient.bash(
      computerId,
      'killall -9 python3 2>/dev/null; rm -f /tmp/ralph_task.lock; echo "Stopped"'
    )
    console.log(stopResult.output)

    // Step 3: Download updated Ralph script
    console.log('\n3. Downloading updated Ralph script...')
    const downloadResult = await orgoClient.bash(
      computerId,
      `curl -fsSL "${RALPH_GIST_URL}" -o ~/ralph_wiggum.py && chmod +x ~/ralph_wiggum.py && head -5 ~/ralph_wiggum.py`
    )
    console.log(downloadResult.output)
    if (downloadResult.exit_code !== 0) {
      throw new Error('Failed to download Ralph script')
    }

    // Step 4: Verify Pillow is available
    console.log('\n4. Verifying Pillow installation...')
    const verifyPillow = await orgoClient.bash(
      computerId,
      'python3 -c "import PIL; print(\'Pillow OK\')"'
    )
    console.log(verifyPillow.output)

    // Step 5: Restart Ralph
    console.log('\n5. Starting Ralph Wiggum...')
    const startResult = await orgoClient.bash(
      computerId,
      '(bash -c "~/start-ralph.sh >/dev/null 2>&1 &") && sleep 2 && echo "Ralph started"'
    )
    console.log(startResult.output)

    // Step 6: Check if Ralph is running
    console.log('\n6. Verifying Ralph is running...')
    const checkResult = await orgoClient.bash(
      computerId,
      'ps aux | grep -E "[r]alph_wiggum.py" && echo "✓ Ralph is running" || echo "✗ Ralph not found in process list"'
    )
    console.log(checkResult.output)

    console.log('\n✅ Ralph update complete!')
    console.log(`Check logs: tail -f ~/ralph_wiggum.log`)

  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()

