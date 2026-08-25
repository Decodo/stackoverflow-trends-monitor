import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import * as cheerio from 'cheerio';
import type { StackOverflowQuestion, StackOverflowSearchParams } from '../decodo/decodo.types';

interface StackExchangeOwner { display_name?: string; }
interface StackExchangeQuestion {
  question_id: number;
  title: string;
  body?: string;
  owner?: StackExchangeOwner;
  score: number;
  answer_count: number;
  view_count: number;
  tags: string[];
  link: string;
  creation_date: number;
}
interface StackExchangeResponse {
  items?: StackExchangeQuestion[];
  has_more?: boolean;
  backoff?: number;
  error_id?: number;
  error_message?: string;
  error_name?: string;
  quota_remaining?: number;
}

export interface StackOverflowSearchResult {
  questions: StackOverflowQuestion[];
  hasMore: boolean;
}

export type StackOverflowSort = 'activity' | 'creation' | 'votes' | 'hot' | 'week' | 'month';

function stripHtml(value = ''): string {
  if (!value) return '';
  return cheerio.load(`<div>${value}</div>`)('div').text().replace(/\s+/g, ' ').trim();
}
function toEpochStart(date: string): number { return Math.floor(new Date(`${date}T00:00:00.000Z`).getTime() / 1000); }
function toEpochEnd(date: string): number { return Math.floor(new Date(`${date}T23:59:59.999Z`).getTime() / 1000); }
function toQuestion(item: StackExchangeQuestion): StackOverflowQuestion {
  return {
    id: String(item.question_id),
    title: stripHtml(item.title),
    author: stripHtml(item.owner?.display_name ?? '') || 'unknown',
    score: item.score ?? 0,
    answerCount: item.answer_count ?? 0,
    viewCount: item.view_count ?? 0,
    tags: item.tags ?? [],
    url: item.link,
    excerpt: stripHtml(item.body).slice(0, 500),
    createdAt: item.creation_date,
  };
}

@Injectable()
export class StackExchangeService {
  private readonly logger = new Logger(StackExchangeService.name);
  private readonly cache = new Map<string, { expiresAt: number; value: StackOverflowSearchResult }>();
  private readonly methodBackoffUntil = new Map<string, number>();
  private readonly backoffSafetyMs = 2_000;

  private async wait(ms: number, signal?: AbortSignal): Promise<void> {
    if (ms <= 0) return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      const onAbort = () => {
        clearTimeout(timer);
        reject(signal?.reason ?? new Error('Request aborted'));
      };
      if (signal?.aborted) return onAbort();
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  private methodKey(url: URL): string {
    return url.pathname.replace(/^\/2\.3\//, '');
  }

  private async fetchQuestions(url: URL, signal?: AbortSignal): Promise<StackOverflowSearchResult> {
    const cacheKey = url.toString();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      this.logger.log(`Using cached Stack Exchange response for ${this.methodKey(url)}`);
      return cached.value;
    }

    const method = this.methodKey(url);
    const backoffUntil = this.methodBackoffUntil.get(method) ?? 0;
    if (backoffUntil > Date.now()) {
      const waitMs = backoffUntil - Date.now();
      this.logger.warn(`Honoring Stack Exchange backoff for ${method}: waiting ${Math.ceil(waitMs / 1000)}s (includes safety buffer)`);
      await this.wait(waitMs, signal);
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(url, { headers: { Accept: 'application/json' }, signal });
      const raw = await response.text();
      let data: StackExchangeResponse = {};
      try {
        data = raw ? (JSON.parse(raw) as StackExchangeResponse) : {};
      } catch {
        // Keep the raw HTTP status below if the API/proxy returned a non-JSON response.
      }

      if (data.backoff) {
        const until = Date.now() + data.backoff * 1000 + this.backoffSafetyMs;
        this.methodBackoffUntil.set(method, Math.max(this.methodBackoffUntil.get(method) ?? 0, until));
        this.logger.warn(`Stack Exchange API requested a ${data.backoff}s backoff for ${method}; adding a ${this.backoffSafetyMs / 1000}s safety buffer.`);
      }

      if (data.error_name === 'throttle_violation' && !data.backoff) {
        // A throttle violation can arrive without a new backoff value when the
        // previous server-side window has not quite expired. Apply a conservative
        // shared pause for this API method before retrying.
        const until = Date.now() + 5_000 + this.backoffSafetyMs;
        this.methodBackoffUntil.set(method, Math.max(this.methodBackoffUntil.get(method) ?? 0, until));
      }

      const retryable =
        data.error_name === 'throttle_violation' ||
        data.error_name === 'temporarily_unavailable' ||
        response.status === 429 ||
        response.status >= 500;

      if (!response.ok || data.error_id) {
        const detail = data.error_name
          ? `${data.error_name}${data.error_message ? `: ${data.error_message}` : ''}`
          : `${response.status} ${response.statusText}${raw && !raw.trim().startsWith('{') ? `: ${raw.slice(0, 180)}` : ''}`;

        if (retryable && attempt < 2) {
          const storedBackoff = this.methodBackoffUntil.get(method) ?? 0;
          const retryAfterMs = Math.max(
            storedBackoff - Date.now(),
            data.backoff ? data.backoff * 1000 + this.backoffSafetyMs : 2_000 * (attempt + 1),
          );
          this.logger.warn(`Stack Exchange API ${detail}; retrying after ${Math.ceil(retryAfterMs / 1000)}s`);
          await this.wait(retryAfterMs, signal);
          continue;
        }

        throw new ServiceUnavailableException(`Stack Exchange API error: ${detail}`);
      }

      const questions = (data.items ?? []).map(toQuestion);
      this.logger.log(`Stack Exchange API returned ${questions.length} questions${data.has_more ? '+' : ''} (quota remaining: ${data.quota_remaining ?? 'unknown'})`);
      const result = { questions, hasMore: Boolean(data.has_more) };
      // Stack Exchange strongly caches API responses and advises against repeating
      // semantically identical requests more than once a minute.
      this.cache.set(cacheKey, { expiresAt: Date.now() + 60_000, value: result });
      return result;
    }

    throw new ServiceUnavailableException('Stack Exchange API request failed after retries.');
  }

  async searchStackOverflow(params: StackOverflowSearchParams, signal?: AbortSignal): Promise<StackOverflowSearchResult> {
    const { query, tags = [], startDate, endDate, limit = 30 } = params;
    const url = new URL('https://api.stackexchange.com/2.3/search/advanced');
    url.searchParams.set('site', 'stackoverflow');
    url.searchParams.set('q', query);
    url.searchParams.set('fromdate', String(toEpochStart(startDate)));
    url.searchParams.set('todate', String(toEpochEnd(endDate)));
    url.searchParams.set('sort', 'creation');
    url.searchParams.set('order', 'desc');
    url.searchParams.set('pagesize', String(Math.max(1, Math.min(100, limit))));
    url.searchParams.set('filter', 'withbody');
    if (tags.length) url.searchParams.set('tagged', tags.join(';'));
    this.logger.log(`Searching Stack Exchange API: ${query} (${startDate}..${endDate})${tags.length ? ` tags=${tags.join(',')}` : ''}`);
    const result = await this.fetchQuestions(url, signal);
    return { questions: result.questions.slice(0, limit), hasMore: result.hasMore };
  }

  async getQuestions(
    sort: StackOverflowSort,
    options: { limit?: number; startDate?: string; endDate?: string } = {},
    signal?: AbortSignal,
  ): Promise<StackOverflowQuestion[]> {
    const limit = options.limit ?? 10;
    const url = new URL('https://api.stackexchange.com/2.3/questions');
    url.searchParams.set('site', 'stackoverflow');
    url.searchParams.set('sort', sort);
    url.searchParams.set('order', 'desc');
    url.searchParams.set('pagesize', String(Math.max(1, Math.min(100, limit))));
    url.searchParams.set('filter', 'withbody');
    if (options.startDate) url.searchParams.set('fromdate', String(toEpochStart(options.startDate)));
    if (options.endDate) url.searchParams.set('todate', String(toEpochEnd(options.endDate)));
    this.logger.log(`Loading Stack Overflow questions: sort=${sort}${options.startDate ? ` from=${options.startDate}` : ''}`);
    return (await this.fetchQuestions(url, signal)).questions.slice(0, limit);
  }
}
