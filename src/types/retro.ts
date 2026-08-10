/**
 * Tipos do módulo de Retrospectiva.
 * Modelo de dados persistido no S3 como JSON.
 */

// --- Reactions ---

export type ReactionType = "heart" | "thumbsUp" | "thumbsDown";

export interface Reaction {
  type: ReactionType;
  userIds: string[]; // accountIds do Jira
}

// --- Card ---

export interface RetroCard {
  id: string;
  text: string;
  authorId: string;     // accountId do Jira
  authorName: string;   // displayName
  createdAt: string;    // ISO 8601
  reactions: Reaction[];
  votes: string[];      // accountIds de quem votou
  mergedFrom?: string[]; // IDs de cards que foram mergeados neste
}

// --- Column ---

export interface RetroColumn {
  id: string;
  title: string;
  tooltip?: string;
  order: number;
  cards: RetroCard[];
}

// --- Board Settings ---

export interface RetroBoardSettings {
  /** Ocultar cards de outros usuários (cada um vê só os seus) */
  hideCards: boolean;
  /** Votação habilitada */
  votingEnabled: boolean;
  /** Mostrar contagem de votos */
  showVoteCount: boolean;
  /** Máximo de votos por usuário */
  maxVotesPerUser: number;
  /** Escopo do limite de votos: true = por coluna, false = por board */
  voteScopePerColumn: boolean;
}

// --- Timer ---

export interface RetroTimer {
  /** Timestamp ISO quando o timer foi iniciado (null = parado) */
  startedAt: string | null;
  /** Duração total em segundos */
  durationSeconds: number;
  /** Timestamp ISO quando foi pausado (null = não pausado) */
  pausedAt: string | null;
  /** Segundos restantes no momento da pausa */
  remainingOnPause?: number;
}

// --- Board ---

export interface RetroBoard {
  id: string;
  squadSlug: string;
  squadName: string;
  createdAt: string;    // ISO 8601
  updatedAt: string;    // ISO 8601
  createdBy: string;    // accountId do criador
  settings: RetroBoardSettings;
  timer: RetroTimer;
  columns: RetroColumn[];
}

// --- Board Summary (para listagem na home) ---

export interface RetroBoardSummary {
  id: string;
  squadSlug: string;
  squadName: string;
  updatedAt: string;
  totalCards: number;
  columnCount: number;
  columns: { title: string; tooltip?: string; cardCount: number }[];
}

// --- Permissions ---

export type RetroRole = "admin" | "developer";

export interface RetroUserPermissions {
  role: RetroRole;
  canManageColumns: boolean;
  canManageTimer: boolean;
  canManageSettings: boolean;
  canMergeCards: boolean;
  canDeleteAnyCard: boolean;
  canEditAnyCard: boolean;
  canCreateCards: boolean;
  canReact: boolean;
  canVote: boolean;
}

// --- API Payloads ---

export interface CreateCardPayload {
  columnId: string;
  text: string;
}

export interface UpdateCardPayload {
  cardId: string;
  columnId: string;
  text?: string;
}

export interface DeleteCardPayload {
  cardId: string;
  columnId: string;
}

export interface MoveCardPayload {
  cardId: string;
  fromColumnId: string;
  toColumnId: string;
  newIndex: number;
}

export interface MergeCardsPayload {
  targetCardId: string;
  sourceCardId: string;
  columnId: string;
}

export interface AddColumnPayload {
  title: string;
  tooltip?: string;
}

export interface RenameColumnPayload {
  columnId: string;
  title: string;
  tooltip?: string;
}

export interface DeleteColumnPayload {
  columnId: string;
}

export interface ReactPayload {
  cardId: string;
  columnId: string;
  reactionType: ReactionType;
}

export interface VotePayload {
  cardId: string;
  columnId: string;
}

export interface UnmergePayload {
  cardId: string;
  columnId: string;
}

export interface TimerPayload {
  action: "start" | "pause" | "reset" | "set";
  durationSeconds?: number;
}
