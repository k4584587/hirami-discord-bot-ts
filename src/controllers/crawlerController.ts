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
    // 크롤링 사이트 정보 조회 (nb_crawling_sites 테이블)
    const crawlingSite = await prisma.crawlingSite.findFirst({
      where: {
        assistantName: assistantName,
        url: url,
      }
    });

    // 최근 실행된 크롤링 데이터(nb_crawling_data 테이블) 조회
    let previousData = "";
    if (crawlingSite) {
      const lastCrawlingData = await prisma.crawlingData.findFirst({
        where: { crawlingSiteId: crawlingSite.id },
        orderBy: { createdAt: 'desc' }
      });
      if (lastCrawlingData) {
        // BigInt를 문자열로 변환하는 replacer 함수 사용
        previousData = JSON.stringify(lastCrawlingData, (_, value) =>
            typeof value === 'bigint' ? value.toString() : value
        );
        console.log(`이전 크롤링 데이터: ${previousData}`);
      }
    }

    // 실제 웹사이트에서 크롤링 수행
    const content = await fetchContentUsingXPath(url, xpath);
    console.log(`Fetched content for siteId ${siteId}: ${content}`);

    // GPT 응답 생성 (이전에 조회한 데이터와 새로 크롤링한 데이터를 함께 전송)
    console.log(`Generating GPT reply for assistant: ${assistantName}`);
    const inputForGPT = `이전 크롤링 데이터: ${previousData}\n새로운 크롤링 데이터: ${content}`;
    const reply = await generateGPTReply(String(2), "api", inputForGPT, assistantName, "json");

    // GPT 응답 파싱
    let jsonResponse;
    try {
      jsonResponse = JSON.parse(reply);
    } catch (parseError) {
      console.error('JSON 파싱 오류:', parseError);
      res.status(500).json({ error: "GPT 응답을 파싱하는 데 실패했습니다." });
      return;
    }

    // 크롤링 데이터 저장 및 크롤링 사이트 정보 업데이트
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
  const { siteId } = req.query;

  if (!siteId) {
    res.status(400).json({ error: 'siteId가 필요합니다.' });
    return;
  }

  try {
    const crawlingData = await prisma.crawlingData.findMany({
      where: {
        crawlingSiteId: Number(siteId)
      },
      include: {
        crawlingSite: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // BigInt 값들을 문자열로 변환하여 직렬화 에러 해결
    const jsonData = JSON.parse(
        JSON.stringify(crawlingData, (key, value) =>
            typeof value === 'bigint' ? value.toString() : value
        )
    );

    res.status(200).json(jsonData);
  } catch (error) {
    console.error('크롤링 데이터 조회 에러:', error);
    res.status(500).json({ error: '크롤링 데이터를 가져오는데 실패했습니다.' });
  }
}