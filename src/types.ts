export type UserRole = 'student' | 'teacher' | 'admin';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  xp?: number;
  streak?: number;
  badges?: string[];
}

export interface Checkpoint {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  type: 'reading' | 'quiz' | 'chat';
}

export interface LearningPath {
  id: string;
  title: string;
  checkpoints: Checkpoint[];
  progress: number;
}

export type BloomLevel = 'Remember' | 'Understand' | 'Apply' | 'Analyze' | 'Evaluate' | 'Create';
export type WebbLevel = 'L1' | 'L2' | 'L3' | 'L4';

export interface TextContent {
  id: string;
  title: string;
  content: string;
  teacherId: string;
  createdAt: any;
  targetLevel?: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  bloomLevel?: BloomLevel;
  webbLevel?: WebbLevel;
  keyVocabulary?: string[];
  learningPathId?: string;
}

export interface Question {
  id: string;
  textId: string;
  question: string;
  options: string[];
  correctAnswer: number;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: any;
}

export interface StudentProgress {
  id: string;
  textId: string;
  studentId: string;
  studentName: string;
  comprehensionScore: number;
  scrollPosition?: number;
  timeSpent?: number; // in seconds
  lastActive: any;
  notes?: string;
  chatHistory?: ChatMessage[];
}

export interface StudentAnswer {
  id: string;
  textId: string;
  studentId: string;
  questionId: string;
  isCorrect: boolean;
  timestamp: any;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}
