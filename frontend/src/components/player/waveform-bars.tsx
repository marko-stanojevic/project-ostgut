'use client'

/**
 * WaveformBars — animated equalizer bars used to indicate live playback.
 * Color follows --player-accent so it picks up the active theme.
 */
export function WaveformBars({ height = 'h-4' }: { height?: string }) {
  return (
    <span className={`flex ${height} items-end gap-[3px] animate-in fade-in duration-300`}>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="block w-[3px] origin-bottom rounded-full bg-player-accent"
          style={{
            height: '100%',
            animation: 'wave-bar 0.9s ease-in-out infinite',
            animationDelay: `${i * 0.14}s`,
          }}
        />
      ))}
    </span>
  )
}
