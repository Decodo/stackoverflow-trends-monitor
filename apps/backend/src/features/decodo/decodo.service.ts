import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as cheerio from 'cheerio';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { SettingsService } from '../settings/settings.service';
import type {
  StackOverflowQuestionDetail,
} from './decodo.types';

function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function parseMetric(value: string): number {
  const normalized = value.trim().toLowerCase().replace(/,/g, '');
  const match = normalized.match(/([\d.]+)\s*([km])?/);
  if (!match) return 0;
  const n = Number(match[1]);
  if (!Number.isFinite(n)) return 0;
  if (match[2] === 'k') return Math.round(n * 1_000);
  if (match[2] === 'm') return Math.round(n * 1_000_000);
  return Math.round(n);
}

const MAX_ATTEMPTS = 3;
const CHALLENGE_TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 2_000;

@Injectable()
export class DecodoService implements OnModuleDestroy {
  private readonly logger = new Logger(DecodoService.name);
  private browserPromise?: Promise<Browser>;

  constructor(private readonly settingsService: SettingsService) {}

  async onModuleDestroy(): Promise<void> {
    if (!this.browserPromise) return;
    try {
      const browser = await this.browserPromise;
      await browser.close();
    } catch {
      // Browser may already have exited during shutdown.
    }
  }

  private async getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      this.browserPromise = this.launchBrowser().catch((error) => {
        this.browserPromise = undefined;
        throw error;
      });
    }
    return this.browserPromise;
  }

  private async launchBrowser(): Promise<Browser> {
    const config = await this.settingsService.getEffectiveConfig();
    const { decodoProxyUsername, decodoProxyPassword, decodoProxyHost, decodoProxyPort } = config;

    if (!decodoProxyUsername || !decodoProxyPassword) {
      throw new BadRequestException(
        'DECODO_PROXY_USERNAME and DECODO_PROXY_PASSWORD must be configured',
      );
    }

    const server = `http://${decodoProxyHost}:${decodoProxyPort}`;
    const channel = String(process.env.PLAYWRIGHT_CHANNEL ?? 'chrome').trim();

    this.logger.log(`Launching headless Playwright browser via Decodo residential proxy ${decodoProxyHost}:${decodoProxyPort}`);

    return chromium.launch({
      headless: true,
      ...(channel ? { channel } : {}),
      proxy: {
        server,
        username: decodoProxyUsername,
        password: decodoProxyPassword,
      },
    });
  }

  private async wait(ms: number, signal?: AbortSignal): Promise<void> {
    if (ms <= 0) return;
    if (signal?.aborted) throw signal.reason ?? new Error('Request was cancelled');
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      const onAbort = () => {
        clearTimeout(timer);
        reject(signal?.reason ?? new Error('Request was cancelled'));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  private async challengeStillActive(page: Page): Promise<boolean> {
    const title = (await page.title()).toLowerCase();
    const url = page.url();
    let bodyText = '';
    try {
      bodyText = await page.locator('body').innerText({ timeout: 2_000 });
    } catch {
      // If the body cannot be read, the DOM checks below decide the outcome.
    }

    return (
      title.includes('just a moment') ||
      url.includes('__cf_chl_') ||
      bodyText.includes('Checking your browser') ||
      bodyText.includes('Verify you are human')
    );
  }

  private async scrapeQuestionAttempt(
    url: string,
    attempt: number,
    signal?: AbortSignal,
  ): Promise<StackOverflowQuestionDetail> {
    if (signal?.aborted) throw signal.reason ?? new Error('Request was cancelled');

    const browser = await this.getBrowser();
    let context: BrowserContext | undefined;
    const startedAt = Date.now();

    try {
      // A new browser context gives every retry fresh cookies/storage. The configured
      // Decodo gateway uses rotating residential IPs, so a retry also gets a fresh
      // network opportunity to pass the Cloudflare challenge.
      context = await browser.newContext();
      const page = await context.newPage();

      this.logger.log(`Deep dive ${url.match(/\/questions\/(\d+)/)?.[1] ?? url}: Playwright residential attempt ${attempt}/${MAX_ATTEMPTS}`);

      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });

      const initialStatus = response?.status() ?? 0;
      const initialTitle = await page.title();
      const question = page.locator('#question').first();

      // Cloudflare commonly returns an initial HTTP 403/"Just a moment" response,
      // then completes its JS challenge and renders the real Stack Overflow page.
      // Success is therefore determined by usable DOM content, not the navigation
      // status code.
      try {
        await question.waitFor({ state: 'attached', timeout: CHALLENGE_TIMEOUT_MS });
      } catch {
        const challenge = await this.challengeStillActive(page);
        throw new ServiceUnavailableException(
          challenge
            ? `Cloudflare challenge did not resolve within ${Math.round(CHALLENGE_TIMEOUT_MS / 1000)}s`
            : 'Stack Overflow question content did not appear',
        );
      }

      const finalChallenge = await this.challengeStillActive(page);
      const questionId =
        (await question.getAttribute('data-questionid')) ??
        (await question.getAttribute('data-post-id')) ??
        '';
      const body = cleanText(await question.locator('.js-post-body, .s-prose').first().innerText());

      if (finalChallenge || !questionId || body.length < 50) {
        throw new ServiceUnavailableException(
          finalChallenge
            ? 'Cloudflare challenge remained active after question DOM appeared'
            : 'Rendered Stack Overflow question did not contain enough usable content',
        );
      }

      const html = await page.content();
      const detail = this.parseQuestionPage(html, url);
      const durationMs = Date.now() - startedAt;

      this.logger.log(
        `Deep dive succeeded for ${questionId} · Playwright residential attempt ${attempt} · ` +
          `${html.length.toLocaleString()} chars · ${(durationMs / 1000).toFixed(1)}s` +
          (initialStatus === 403 || initialTitle.toLowerCase().includes('just a moment')
            ? ' · Cloudflare challenge resolved'
            : ''),
      );

      return detail;
    } finally {
      await context?.close().catch(() => undefined);
    }
  }

  async scrapeQuestion(url: string, signal?: AbortSignal): Promise<StackOverflowQuestionDetail> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.scrapeQuestionAttempt(url, attempt, signal);
      } catch (error) {
        lastError = error;
        const questionId = url.match(/\/questions\/(\d+)/)?.[1] ?? url;
        this.logger.warn(
          `Deep dive attempt ${attempt}/${MAX_ATTEMPTS} failed for ${questionId}: ` +
            `${error instanceof Error ? error.message : String(error)}`,
        );

        if (attempt < MAX_ATTEMPTS) {
          await this.wait(RETRY_DELAY_MS, signal);
        }
      }
    }

    throw new ServiceUnavailableException(
      `Stack Overflow deep dive failed after ${MAX_ATTEMPTS} browser attempts: ` +
        `${lastError instanceof Error ? lastError.message : String(lastError ?? 'unknown error')}`,
    );
  }

  private parseQuestionPage(html: string, url: string): StackOverflowQuestionDetail {
    const $ = cheerio.load(html);
    const question = $('#question, .question').first();
    if (!question.length) {
      throw new ServiceUnavailableException('Could not parse the Stack Overflow question page.');
    }

    const id = String(question.attr('data-questionid') ?? question.attr('data-post-id') ?? '').trim();
    const title = cleanText($('h1 a.question-hyperlink, h1').first().text());
    const body = cleanText(question.find('.js-post-body, .s-prose').first().text());
    const score = parseMetric(question.find('.js-vote-count').first().text());
    const tags = question
      .find('.post-tag')
      .map((_, tag) => cleanText($(tag).text()))
      .get();

    const answers = $('.answer')
      .map((_, element) => {
        const root = $(element);
        return {
          id: String(root.attr('data-answerid') ?? root.attr('data-post-id') ?? ''),
          author: cleanText(root.find('.user-details a, .s-user-card--link a').last().text()) || 'unknown',
          body: cleanText(root.find('.js-post-body, .s-prose').first().text()),
          score: parseMetric(root.find('.js-vote-count').first().text()),
          isAccepted: root.hasClass('accepted-answer') || root.find('.js-accepted-answer-indicator').length > 0,
        };
      })
      .get()
      .filter((answer) => answer.body);

    // Include question comments and answer comments. This gives the LLM the full
    // visible discussion rather than only question-level comments.
    const comments = $('.comment')
      .map((_, element) => {
        const root = $(element);
        return {
          id: String(root.attr('data-comment-id') ?? ''),
          author: cleanText(root.find('.comment-user').text()) || 'unknown',
          body: cleanText(root.find('.comment-copy').text()),
          score: parseMetric(root.find('.comment-score span').text()),
        };
      })
      .get()
      .filter((comment) => comment.body);

    const acceptedAnswers = answers.filter((answer) => answer.isAccepted);
    const uniqueAnswerAuthorCount = new Set(answers.map((answer) => answer.author).filter((author) => author && author !== 'unknown')).size;

    return {
      id,
      title,
      author: cleanText(question.find('.user-details a, .s-user-card--link a').last().text()) || 'unknown',
      score,
      answerCount: answers.length,
      viewCount: 0,
      tags,
      url,
      excerpt: body.slice(0, 500),
      body,
      answers,
      comments,
      acceptedAnswerCount: acceptedAnswers.length,
      acceptedAnswerId: acceptedAnswers[0]?.id,
      uniqueAnswerAuthorCount,
    };
  }
}
