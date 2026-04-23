export {}

declare global {
  interface Window {
    __onGCastApiAvailable?: (isAvailable: boolean) => void
    cast?: typeof cast
    chrome?: typeof chrome
    WebKitPlaybackTargetAvailabilityEvent?: {
      new(type: string, eventInitDict?: { availability?: 'available' | 'not-available' }): Event
    }
  }

  interface HTMLMediaElement {
    webkitShowPlaybackTargetPicker?: () => void
    webkitCurrentPlaybackTargetIsWireless?: boolean
  }

  interface HTMLAudioElementEventMap {
    webkitplaybacktargetavailabilitychanged: Event & {
      availability?: 'available' | 'not-available'
    }
    webkitcurrentplaybacktargetiswirelesschanged: Event
  }

  namespace cast.framework {
    const VERSION: string

    enum CastContextEventType {
      CAST_STATE_CHANGED = 'caststatechanged',
      SESSION_STATE_CHANGED = 'sessionstatechanged',
    }

    enum CastState {
      CONNECTED = 'CONNECTED',
      CONNECTING = 'CONNECTING',
      NOT_CONNECTED = 'NOT_CONNECTED',
      NO_DEVICES_AVAILABLE = 'NO_DEVICES_AVAILABLE',
    }

    enum SessionState {
      NO_SESSION = 'NO_SESSION',
      SESSION_STARTING = 'SESSION_STARTING',
      SESSION_STARTED = 'SESSION_STARTED',
      SESSION_START_FAILED = 'SESSION_START_FAILED',
      SESSION_ENDING = 'SESSION_ENDING',
      SESSION_ENDED = 'SESSION_ENDED',
      SESSION_RESUMED = 'SESSION_RESUMED',
      SESSION_RESUME_FAILED = 'SESSION_RESUME_FAILED',
    }

    enum RemotePlayerEventType {
      IS_PAUSED_CHANGED = 'is_paused_changed',
      IS_MEDIA_LOADED_CHANGED = 'is_media_loaded_changed',
      PLAYER_STATE_CHANGED = 'player_state_changed',
      VOLUME_LEVEL_CHANGED = 'volume_level_changed',
      IS_CONNECTED_CHANGED = 'is_connected_changed',
    }

    enum AutoJoinPolicy {
      ORIGIN_SCOPED = 'origin_scoped',
    }

    enum ImageType {
      PHOTO = 'PHOTO',
    }

    interface SessionStateEventData {
      sessionState: SessionState
    }

    interface CastStateEventData {
      castState: CastState
    }

    class Image {
      constructor(url: string)
      type?: ImageType
    }

    class CastContext {
      static getInstance(): CastContext
      setOptions(options: {
        receiverApplicationId: string
        autoJoinPolicy?: AutoJoinPolicy
      }): void
      addEventListener(
        type: CastContextEventType,
        listener: (event: SessionStateEventData | CastStateEventData) => void,
      ): void
      removeEventListener(
        type: CastContextEventType,
        listener: (event: SessionStateEventData | CastStateEventData) => void,
      ): void
      requestSession(): Promise<void>
      getCurrentSession(): CastSession | null
      getCastState(): CastState
    }

    class CastSession {
      loadMedia(request: chrome.cast.media.LoadRequest): Promise<void>
      endSession(stopCasting: boolean): void
      getSessionObj(): { media: chrome.cast.media.Media[] }
    }

    class RemotePlayer {
      isPaused: boolean
      isConnected: boolean
      isMediaLoaded: boolean
      volumeLevel: number
      playerState?: string
    }

    class RemotePlayerController {
      constructor(player: RemotePlayer)
      addEventListener(type: RemotePlayerEventType, listener: () => void): void
      removeEventListener(type: RemotePlayerEventType, listener: () => void): void
      playOrPause(): void
      stop(): void
      setVolumeLevel(): void
    }
  }

  namespace chrome.cast.media {
    const DEFAULT_MEDIA_RECEIVER_APP_ID: string

    enum StreamType {
      BUFFERED = 'BUFFERED',
      LIVE = 'LIVE',
    }

    enum PlayerState {
      IDLE = 'IDLE',
      PLAYING = 'PLAYING',
      PAUSED = 'PAUSED',
      BUFFERING = 'BUFFERING',
    }

    class GenericMediaMetadata {
      title?: string
      subtitle?: string
      images?: cast.framework.Image[]
    }

    class MediaInfo {
      constructor(contentId: string, contentType?: string)
      metadata?: GenericMediaMetadata
      streamType?: StreamType
    }

    class LoadRequest {
      constructor(mediaInfo: MediaInfo)
      autoplay?: boolean
      currentTime?: number
    }

    interface Media {
      playerState?: PlayerState
    }
  }
}
