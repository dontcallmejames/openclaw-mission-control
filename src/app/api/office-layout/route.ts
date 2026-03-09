import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

const LAYOUT_DIR  = join(process.env.HOME ?? '/root', '.openclaw', 'workspace')
const LAYOUT_FILE = join(LAYOUT_DIR, 'office-layout.json')

export async function GET() {
  try {
    if (!existsSync(LAYOUT_FILE)) {
      return NextResponse.json(null)
    }
    const data = readFileSync(LAYOUT_FILE, 'utf-8')
    return NextResponse.json(JSON.parse(data))
  } catch (e) {
    console.error('[office-layout] GET error:', e)
    return NextResponse.json(null)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!existsSync(LAYOUT_DIR)) mkdirSync(LAYOUT_DIR, { recursive: true })
    writeFileSync(LAYOUT_FILE, JSON.stringify(body, null, 2), 'utf-8')
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[office-layout] POST error:', e)
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
