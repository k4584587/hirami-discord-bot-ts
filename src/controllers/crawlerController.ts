// src/controllers/crawlerController.ts

import { PrismaClient } from '@prisma/client';
import { Request, Response } from 'express';
import {
  createCrawlingSite,
  deleteCrawlingSite,
  fetchContentUsingXPath,
  getCrawlingSites,
  updateCrawlingSite,
  saveCrawlingData,
  getCrawlingData
} from '../services/crawlerService';
import { generateGPTReply } from '../services/chatgptService';

const prisma = new PrismaClient();

// 크롤링 상태 인터페이스 정의
interface CrawlingStatus {
  [siteId: string]: {
    isCrawling: boolean;
    startTime: Date;
    // 필요에 따라 추가 필드
  };
}

// 크롤링 상태를 저장할 객체 초기화
const crawlingStatus: CrawlingStatus = {};

export async function getContent(req: Request, res: Response) {
  console.log('getContent called');

  // 요청 본문에서 파라미터 추출
  const { assistantName, url, xpath } = req.body;

  // 필수 파라미터 확인
  if (typeof assistantName !== 'string' || typeof url !== 'string' || typeof xpath !== 'string') {
    res.status(400).json({ error: 'assistantName, url, and xpath are required as body parameters.' });
    return;
  }

  // 고유 식별자 생성
  const siteId = `${assistantName}-${url}`;

  // 이미 크롤링 중인지 확인
  if (crawlingStatus[siteId] && crawlingStatus[siteId].isCrawling) {
    res.status(400).json({ error: '이미 크롤링이 진행 중입니다.' });
    console.log(`Crawling already in progress for siteId: ${siteId}`);
    return;
  }

  // 크롤링 상태 업데이트
  crawlingStatus[siteId] = { isCrawling: true, startTime: new Date() };
  console.log(`크롤링 시작: ${siteId}`);

  try {
    // 크롤링 수행
    const content = await fetchContentUsingXPath(url, xpath);
    console.log(`Fetched content for siteId ${siteId}: ${content}`);

    // GPT 응답 생성
    console.log(`Generating GPT reply for assistant: ${assistantName}`);
    const reply = await generateGPTReply(String(2), "api", " " + content + " ", assistantName, "json");

    // GPT 응답 파싱
    let jsonResponse;
    try {
      jsonResponse = JSON.parse(reply);
    } catch (parseError) {
      console.error('JSON 파싱 오류:', parseError);
      res.status(500).json({ error: "GPT 응답을 파싱하는 데 실패했습니다." });
      return;
    }

    // 크롤링 사이트 정보 조회 및 데이터 저장
    const crawlingSite = await prisma.crawlingSite.findFirst({
      where: {
        assistantName: assistantName,
        url: url,
      }
    });

    if (crawlingSite) {
      await saveCrawlingData(crawlingSite.id, {
        processedData: jsonResponse,
        crawledAt: new Date(),
      });
      console.log(`크롤링 데이터가 저장되었습니다. 사이트 ID: ${crawlingSite.id}`);

      await updateCrawlingSite(crawlingSite.id, { lastCrawled: new Date() });
      console.log(`크롤링 사이트의 lastCrawled 업데이트: 사이트 ID ${crawlingSite.id}`);
    }

    // 최종 JSON 응답 전송
    res.status(200).json({
      status: 'gptResponse',
      data: jsonResponse
    });
    console.log(`Sent final JSON response for siteId: ${siteId}`);
  } catch (error) {
    console.error('getContent 에러:', error);
    res.status(500).json({ error: "Failed to fetch content." });
  } finally {
    // 크롤링 상태 업데이트
    crawlingStatus[siteId].isCrawling = false;
    console.log(`크롤링 작업 종료: ${siteId}`);
  }
}



// 크롤링 상태 조회 컨트롤러
export async function getCrawlingStatusController(req: Request, res: Response) {
  try {
    res.json(crawlingStatus);
    console.log('현재 크롤링 상태 조회');
  } catch (error: any) {
    console.error('getCrawlingStatus 에러:', error);
    res.status(500).json({ error: '크롤링 상태를 가져오는 데 실패했습니다.' });
  }
}

// CrawlingSite 생성
export async function createCrawlingSiteController(req: Request, res: Response) {
  try {
    const {
      name,
      url,
      xpath,
      assistantName,
      interval,
      isActive
    } = req.body;
    const newCrawlingSite = await createCrawlingSite({
      name,
      url,
      xpath,
      assistantName,
      interval,
      isActive,
    });
    res.status(201).json(newCrawlingSite);
    console.log(`새 크롤링 사이트 생성: ${name}`);
  } catch (error: any) {
    console.error('createCrawlingSiteController 에러:', error);
    res.status(500).json({ error: error.message });
  }
}

// CrawlingSite 조회
export async function getCrawlingSitesController(req: Request, res: Response) {
  try {
    const crawlingSites = await getCrawlingSites();
    res.json(crawlingSites);
    console.log('모든 크롤링 사이트 조회');
  } catch (error: any) {
    console.error('getCrawlingSitesController 에러:', error);
    res.status(500).json({ error: error.message });
  }
}

// CrawlingSite 삭제
export async function deleteCrawlingSiteController(req: Request, res: Response) {
  try {
    const { id } = req.params;
    await deleteCrawlingSite(parseInt(id));
    res.status(204).send();
    console.log(`크롤링 사이트 삭제: ID ${id}`);
  } catch (error: any) {
    console.error('deleteCrawlingSiteController 에러:', error);
    res.status(500).json({ error: error.message });
  }
}

// CrawlingSite 업데이트
export async function updateCrawlingSiteController(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const {
      name,
      url,
      xpath,
      assistantName,
      interval,
      isActive,
      lastCrawled
    } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'CrawlingSite ID가 필요합니다.' });
    }

    const updatedCrawlingSite = await updateCrawlingSite(parseInt(id), {
      name,
      url,
      xpath,
      assistantName,
      interval,
      isActive,
      lastCrawled: lastCrawled ? new Date(lastCrawled) : undefined,
    });

    res.json(updatedCrawlingSite);
    console.log(`크롤링 사이트 업데이트: ID ${id}`);
  } catch (error: any) {
    console.error('updateCrawlingSiteController 에러:', error);
    res.status(500).json({ error: error.message });
  }
}

// CrawlingData 조회
export async function getCrawlingDataController(req: Request, res: Response) {
  try {
    const { siteId } = req.query;
    const crawlingData = await getCrawlingData(
        siteId ? parseInt(siteId as string) : undefined
    );
    res.json(crawlingData);
  } catch (error: any) {
    console.error('getCrawlingDataController 에러:', error);
    res.status(500).json({ error: error.message });
  }
}
