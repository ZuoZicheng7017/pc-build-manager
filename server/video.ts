import { spawn } from 'node:child_process'
import fs from 'node:fs'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'

function binary(): string {
  const configured = process.env.FFMPEG_PATH
  if (configured && fs.existsSync(configured)) return configured
  return ffmpegInstaller.path
}

export function hasFfmpeg(): boolean {
  try {
    return fs.existsSync(binary())
  } catch {
    return false
  }
}

/**
 * 手机视频常见 HEVC/H.265、MOV、10-bit HDR，Chrome/Edge 往往只能播放声音。
 * 统一转成 H.264 + AAC 的 MP4，保证 Windows / Android / iPhone 都能播放。
 */
export function transcodeVideo(input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-loglevel', 'error',
      '-i', input,
      '-map', '0:v:0',
      '-map', '0:a:0?',
      '-vf', "scale=w='min(1920,iw)':h=-2",
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-max_muxing_queue_size', '1024',
      output,
    ]
    const child = spawn(binary(), args, { windowsHide: true })
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('视频转码超时（超过 10 分钟）'))
    }, 10 * 60 * 1000)
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(stderr.slice(-800) || `ffmpeg 退出码 ${code}`))
    })
  })
}
