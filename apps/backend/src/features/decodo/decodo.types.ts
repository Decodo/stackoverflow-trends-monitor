export type DecodoTarget = 'universal';

export interface DecodoScrapeRequest {
  target: DecodoTarget;
  url: string;
  locale?: string;
  headless?: 'html' | 'png';
  markdown?: boolean;
}

export interface DecodoScrapeResponse {
  status: number;
  url: string;
  content: unknown;
  target: DecodoTarget;
}

export type TimeRange = 'day' | 'week' | 'month' | 'year';

export interface StackOverflowQuestion {
  id: string;
  title: string;
  author: string;
  score: number;
  answerCount: number;
  viewCount: number;
  tags: string[];
  url: string;
  excerpt: string;
  createdAt?: number;
}

export interface StackOverflowAnswer {
  id: string;
  author: string;
  body: string;
  score: number;
  isAccepted: boolean;
}

export interface StackOverflowComment {
  id: string;
  author: string;
  body: string;
  score: number;
}

export interface StackOverflowQuestionDetail extends StackOverflowQuestion {
  body: string;
  answers: StackOverflowAnswer[];
  comments: StackOverflowComment[];
  acceptedAnswerCount: number;
  acceptedAnswerId?: string;
  uniqueAnswerAuthorCount: number;
}

export interface StackOverflowSearchParams {
  query: string;
  tags?: string[];
  startDate: string;
  endDate: string;
  limit?: number;
}
