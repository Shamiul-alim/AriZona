/** Shapes returned by the backend. Kept in one place as the API contract. */

export type AnimeType = 'TV' | 'MOVIE' | 'OVA' | 'ONA' | 'SPECIAL' | 'TV_SHORT' | 'TV_SPECIAL' | 'MUSIC' | 'OTHER';
export type AnimeStatus = 'ONGOING' | 'COMPLETED' | 'UPCOMING' | 'HIATUS' | 'CANCELLED';
export type AnimeSeason = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';
export type AgeRating = 'G' | 'PG' | 'PG_13' | 'R_17' | 'R_PLUS' | 'RX';
export type WatchStatus = 'WATCHING' | 'COMPLETED' | 'PLAN_TO_WATCH' | 'ON_HOLD' | 'DROPPED';
export type UserRole = 'USER' | 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN';
export type MediaKind = 'SUB' | 'DUB';
export type MediaProviderName = 'GOOGLE_DRIVE' | 'HLS' | 'DIRECT_FILE' | 'OBJECT_STORAGE' | 'EXTERNAL_EMBED';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
}

export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface GenreRef {
  name: string;
  slug: string;
}

export interface AnimeCard {
  id: string;
  slug: string;
  title: string;
  titleEnglish: string;
  titleJapanese: string | null;
  posterUrl: string | null;
  type: AnimeType;
  status: AnimeStatus;
  score: number;
  scoreCount: number;
  releaseYear: number | null;
  season: AnimeSeason | null;
  totalEpisodes: number | null;
  subCount: number;
  dubCount: number;
  durationMinutes: number | null;
  ageRating: AgeRating | null;
  viewCount: number;
  genres: GenreRef[];
  updatedAt: string;
}

export interface AnimeDetail extends Omit<AnimeCard, 'genres'> {
  synopsis: string | null;
  bannerUrl: string | null;
  trailerUrl: string | null;
  titleRomaji: string | null;
  airStartDate: string | null;
  airEndDate: string | null;
  source: string | null;
  favoriteCount: number;
  publishedEpisodeCount: number;
  seoTitle: string | null;
  seoDescription: string | null;
  studio: { id: string; name: string; slug: string } | null;
  genres: Array<{ id: string; name: string; slug: string; color: string | null }>;
  producers: Array<{ id: string; name: string; slug: string }>;
  titles: Array<{ title: string; kind: string }>;
  related: Array<{ kind: string; anime: AnimeCard }>;
  userState: {
    watchStatus: WatchStatus | null;
    progressEpisodes: number;
    isFavorite: boolean;
    rating: number | null;
    lastWatched: { episodeId: string; episodeNumber: number; positionSeconds: number; percent: number } | null;
  } | null;
}

export interface FeaturedEntry {
  id: string;
  headline: string | null;
  subtitle: string | null;
  ctaLabel: string | null;
  backdropUrl: string | null;
  anime: AnimeCard & { synopsis: string | null; bannerUrl: string | null; studio: string | null };
}

export interface EpisodeSummary {
  id: string;
  number: number;
  title: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  airDate: string | null;
  hasSub: boolean;
  hasDub: boolean;
  isFiller: boolean;
  viewCount: number;
}

export interface LatestEpisode {
  id: string;
  number: number;
  title: string | null;
  thumbnailUrl: string | null;
  hasSub: boolean;
  hasDub: boolean;
  createdAt: string;
  durationSeconds: number | null;
  anime: {
    slug: string;
    titleEnglish: string;
    titleJapanese: string | null;
    posterUrl: string | null;
    type: AnimeType;
    subEpisodeCount: number;
    dubEpisodeCount: number;
    totalEpisodes: number | null;
    score: number;
  };
}

// --- Playback ---------------------------------------------------------------

export interface QualityOption {
  id: string;
  quality: string;
  label: string;
  height: number;
  isDefault: boolean;
  url: string;
  expiresAt: number;
}

export interface SubtitleOption {
  id: string;
  language: string;
  label: string;
  isDefault: boolean;
  isForced: boolean;
  url: string;
  expiresAt: number;
}

export interface AudioTrackOption {
  id: string;
  language: string;
  label: string;
  hlsGroupId: string | null;
  isDefault: boolean;
}

export interface PlaybackSource {
  id: string;
  label: string;
  provider: MediaProviderName;
  kind: MediaKind;
  audioLanguage: string;
  audioLabel: string;
  isDefault: boolean;
  /** False only for EXTERNAL_EMBED, where we genuinely cannot drive playback. */
  seekable: boolean;
  isHls: boolean;
  hlsUrl: string | null;
  embedUrl: string | null;
  qualities: QualityOption[];
  audioTracks: AudioTrackOption[];
  subtitles: SubtitleOption[];
}

/** An episode-level audio file (e.g. a dub) served through a signed URL. */
export interface ExternalAudioTrack {
  id: string;
  language: string;
  label: string;
  isDefault: boolean;
  mimeType: string;
  url: string;
  expiresAt: string;
}

export interface EpisodeProgress {
  positionSeconds: number;
  durationSeconds: number | null;
  percent: number;
  completed: boolean;
  lastWatchedAt?: string;
}

export interface ContinueWatchingItem {
  state: 'resume' | 'next';
  positionSeconds: number;
  durationSeconds: number | null;
  percent: number;
  remainingSeconds: number | null;
  lastWatchedAt: string;
  anime: {
    id: string;
    slug: string;
    titleEnglish: string;
    titleJapanese: string | null;
    posterUrl: string | null;
    bannerUrl: string | null;
  };
  episode: {
    id: string;
    number: number;
    title: string | null;
    thumbnailUrl: string | null;
    durationSeconds: number | null;
  };
}

export interface WatchPayload {
  anime: {
    id: string;
    slug: string;
    titleEnglish: string;
    titleJapanese: string | null;
    posterUrl: string | null;
    bannerUrl: string | null;
    type: AnimeType;
    status: AnimeStatus;
    score: number;
    releaseYear: number | null;
    totalEpisodes: number | null;
    synopsis: string | null;
    ageRating: AgeRating | null;
    studio: { name: string; slug: string } | null;
    genres: GenreRef[];
  };
  episode: {
    id: string;
    number: number;
    title: string | null;
    description: string | null;
    thumbnailUrl: string | null;
    durationSeconds: number | null;
    airDate: string | null;
    hasSub: boolean;
    hasDub: boolean;
    isFiller: boolean;
    viewCount: number;
    introStart: number | null;
    introEnd: number | null;
    outroStart: number | null;
    outroEnd: number | null;
  };
  navigation: {
    previous: { number: number; title: string | null } | null;
    next: { number: number; title: string | null } | null;
  };
  playback: {
    sources: PlaybackSource[];
    defaultSourceId: string | null;
    hasSub: boolean;
    hasDub: boolean;
    /** Separate audio files played in sync with the (muted) video. */
    audioTracks?: ExternalAudioTrack[];
  };
  downloads: Array<{
    id: string;
    label: string;
    quality: string;
    kind: MediaKind;
    url: string;
    sizeBytes: number | null;
  }>;
  progress: { positionSeconds: number; percent: number; completed: boolean } | null;
}

// --- Users ------------------------------------------------------------------

export interface RankRef {
  name: string;
  slug?: string;
  icon: string | null;
  color: string | null;
  requiredMana?: number;
}

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: UserRole;
  status: string;
  mana: number;
  titlePreference: 'ENGLISH' | 'JAPANESE';
  emailVerified: boolean;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
}

export interface PublicProfile {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bio: string | null;
  role: UserRole;
  mana: number;
  createdAt: string;
  rank: RankRef | null;
  nextRank: RankRef | null;
  rankProgressPercent: number;
  stats: {
    watchlist: Record<WatchStatus, number>;
    favorites: number;
    comments: number;
    posts: number;
  };
}

export interface CommentAuthor {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: UserRole;
  mana: number;
  rank: RankRef | null;
}

export interface CommentNode {
  id: string;
  body: string | null;
  isDeleted: boolean;
  isSpoiler: boolean;
  isEdited: boolean;
  upvoteCount: number;
  downvoteCount: number;
  replyCount: number;
  createdAt: string;
  myVote: number | null;
  author: CommentAuthor | null;
  replies: CommentNode[];
}

// --- Community --------------------------------------------------------------

export type CommunityPostKind = 'TEXT' | 'POLL' | 'TIER_LIST' | 'MATCHUP' | 'RECOMMENDATION';

export interface CommunityCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  staffOnly: boolean;
  _count?: { posts: number };
}

export interface PollOption {
  id: string;
  text: string;
  imageUrl: string | null;
  voteCount: number;
  percent: number;
  anime: { id: string; slug: string; titleEnglish: string; posterUrl: string | null } | null;
}

export interface PollData {
  id: string;
  question: string;
  allowMultiple: boolean;
  totalVotes: number;
  closesAt: string | null;
  isClosed: boolean;
  hasVoted: boolean;
  myVotes: string[];
  options: PollOption[];
}

export interface CommunityPostSummary {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  kind: CommunityPostKind;
  category: { name: string; slug: string; color: string | null; icon: string | null };
  author: CommentAuthor;
  upvoteCount: number;
  downvoteCount: number;
  commentCount: number;
  viewCount: number;
  isPinned: boolean;
  isLocked: boolean;
  createdAt: string;
  myVote: number | null;
  poll: { id: string; question: string; totalVotes: number; closesAt: string | null } | null;
  anime: Array<{ id: string; slug: string; titleEnglish: string; posterUrl: string | null; score: number }>;
}

export interface CommunityPostDetail extends Omit<CommunityPostSummary, 'excerpt' | 'poll'> {
  body: string;
  isEdited: boolean;
  poll: PollData | null;
  tierList: Array<{
    id: string;
    tier: 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
    label: string;
    order: number;
    anime: { id: string; slug: string; titleEnglish: string; posterUrl: string | null } | null;
  }>;
}

export interface CommunityComment {
  id: string;
  body: string;
  author: CommentAuthor;
  upvoteCount: number;
  replyCount: number;
  isEdited: boolean;
  createdAt: string;
  myVote: number | null;
  replies: CommunityComment[];
}

// --- Ads --------------------------------------------------------------------

export interface DisplayPlacement {
  key: string;
  type: string;
  adClient: string | null;
  adSlot: string | null;
  format: string | null;
  fullWidthResponsive: boolean;
}

export interface AdsConfig {
  display: DisplayPlacement[];
  video:
    | { enabled: false }
    | {
        enabled: true;
        vastTagUrl: string;
        preRoll: boolean;
        midRoll: boolean;
        postRoll: boolean;
        midRollIntervalSeconds: number;
        midRollCuePoints: number[];
        frequencyCapPerHour: number;
      };
}
