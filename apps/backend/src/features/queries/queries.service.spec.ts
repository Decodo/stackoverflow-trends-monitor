import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { QueriesService } from './queries.service';
import { Query } from './queries.schema';
import type { StackOverflowReport } from '../llm/llm.types';
import type { StackOverflowQuestion } from '../decodo/decodo.types';

const mockReport: StackOverflowReport = {
  executiveSummary: 'Summary',
  themes: [],
  developerPainPoints: [],
  notableQuestions: [],
  longitudinal: { summary: 'Not enough history yet.', signals: [] },
};

const mockDoc = {
  _id: 'doc-123',
  prompt: 'test prompt',
  plan: {
    prompt: 'test prompt',
    keywords: ['proxies'],
    tags: ['proxy'],
    queries: ['proxies'],
    timeRange: 'week' as const,
  },
  posts: [] as StackOverflowQuestion[],
  trendStats: [],
  report: mockReport,
  createdAt: new Date(),
};

const mockCreateDto = {
  prompt: 'test prompt',
  plan: mockDoc.plan,
  posts: [] as StackOverflowQuestion[],
  trendStats: [],
  report: mockReport,
};

function buildModelMock() {
  const MockModel = jest.fn().mockImplementation(() => ({
    save: jest.fn().mockResolvedValue(mockDoc),
  })) as jest.Mock & {
    find: jest.Mock;
    findById: jest.Mock;
    findByIdAndDelete: jest.Mock;
  };

  MockModel.find = jest.fn().mockReturnValue({
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([mockDoc]),
  });

  MockModel.findById = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(mockDoc) });
  MockModel.findByIdAndDelete = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(mockDoc) });
  return MockModel;
}

describe('QueriesService', () => {
  let service: QueriesService;
  let MockModel: ReturnType<typeof buildModelMock>;

  beforeEach(async () => {
    MockModel = buildModelMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [QueriesService, { provide: getModelToken(Query.name), useValue: MockModel }],
    }).compile();
    service = module.get<QueriesService>(QueriesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('creates and saves a document', async () => {
    const result = await service.create(mockCreateDto);
    expect(MockModel).toHaveBeenCalledWith(mockCreateDto);
    expect(result).toBe(mockDoc);
  });

  it('returns history newest first without raw posts', async () => {
    const result = await service.findAll();
    const chain = MockModel.find.mock.results[0].value;
    expect(chain.select).toHaveBeenCalledWith('-posts');
    expect(chain.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(result).toEqual([mockDoc]);
  });

  it('returns a document by id', async () => {
    expect(await service.findOne('doc-123')).toBe(mockDoc);
  });

  it('throws when a document does not exist', async () => {
    MockModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
  });

  it('deletes a document', async () => {
    await expect(service.remove('doc-123')).resolves.toBeUndefined();
  });
});
