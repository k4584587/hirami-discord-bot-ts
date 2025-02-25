import {Request, Response} from "express";
import {fetchContentUsingXPath, saveCrawlingData, updateCrawlingSite} from "../services/crawlerService";
import {generateGPTReply} from "../services/chatgptService";
import {PrismaClient} from "@prisma/client";

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

interface Post {
  id: number;
  category: string;
  title: string;
  author: string;
  date: string;
  views: number;
  comments: number;
  likes: number;
}

/**
 * 활성화된 사이트 중, 크롤링 주기에 맞는 사이트들을 조회하여 크롤링 작업을 실행하는 스케줄러 API
 */
export async function executeScheduledCrawling (req: Request, res: Response) {
  try {
    // 활성화된 사이트들 조회
    const activeSites = await prisma.crawlingSite.findMany({
      where: { isActive: true }
    });
    const now = new Date();

    const results = [];

    // 각 사이트별로 크롤링 주기가 지난 경우에만 실행
    for (const site of activeSites) {
      const lastCrawled = site.lastCrawled ? new Date(site.lastCrawled) : null;
      const intervalMs = site.interval * 60 * 1000; // interval(분)을 ms로 변환

      // 디버그용 로그: 마지막 크롤링 이후 경과 시간
      if (lastCrawled) {
        console.log(`사이트 ${site.id}: 마지막 크롤링 후 ${now.getTime() - lastCrawled.getTime()} ms 경과 (필요: ${intervalMs} ms)`);
      } else {
        console.log(`사이트 ${site.id}: 마지막 크롤링 기록 없음.`);
      }

      // lastCrawled가 없거나 interval이 지난 경우에만 크롤링 시도
      if (!lastCrawled || now.getTime() - lastCrawled.getTime() >= intervalMs) {
        const siteId = `${site.assistantName}-${site.url}`;
        if (crawlingStatus[siteId] && crawlingStatus[siteId].isCrawling) {
          results.push({ siteId, status: '이미 크롤링 진행 중' });
          continue;
        }
        crawlingStatus[siteId] = { isCrawling: true, startTime: now };
        try {
          // 크롤링 수행 (XPath를 통해 콘텐츠 추출)
          const content = await fetchContentUsingXPath(site.url, site.xpath);
          if (!content) {
            results.push({ siteId, status: '크롤링된 콘텐츠 없음' });
          } else {
            // GPT를 통해 데이터 파싱
            const initialReply = await generateGPTReply(String(2), "api", content, site.assistantName, "json");
            const parsedContent = JSON.parse(initialReply);
            const allPosts: Post[] = parsedContent.posts || [];

            // 이전 크롤링 데이터 조회 및 BigInt 처리
            let previousData: any = null;
            let previousPostIds: number[] = [];
            const lastCrawlingData = await prisma.crawlingData.findFirst({
              where: { crawlingSiteId: site.id },
              orderBy: { createdAt: 'desc' },
            });
            if (lastCrawlingData) {
              previousData = JSON.parse(
                  JSON.stringify(lastCrawlingData, (_, value) =>
                      typeof value === 'bigint' ? value.toString() : value
                  )
              );
              previousPostIds = previousData.crawlingSiteData?.data?.posts?.map((post: Post) => post.id) || [];
            }

            // 새로운 게시글 필터링
            const newPosts = allPosts.filter((post: Post) => !previousPostIds.includes(post.id));

            if (newPosts.length === 0) {
              // 새로운 게시글이 없으면 이전 데이터가 있으면 "previous_data", 없으면 "no_new_data" 반환
              if (previousData) {
                results.push({ siteId, status: 'previous_data' });
              } else {
                results.push({ siteId, status: 'no_new_data' });
              }
              // lastCrawled 업데이트는 하지 않음 -> 다음 실행 시 다시 시도
            } else {
              const jsonResponse = { posts: newPosts };
              // 크롤링 데이터 저장
              await saveCrawlingData(site.id, {
                processedData: jsonResponse,
                crawledAt: new Date(),
              });
              // 새로운 게시글이 있을 때만 lastCrawled 업데이트
              await updateCrawlingSite(site.id, { lastCrawled: new Date() });
              results.push({ siteId, status: '크롤링 성공', newPosts: newPosts.length });
            }
          }
        } catch (error) {
          console.error(`사이트 ${site.id} 크롤링 에러:`, error);
          results.push({ siteId, status: '크롤링 실패' });
        } finally {
          crawlingStatus[siteId].isCrawling = false;
        }
      } else {
        results.push({ siteId: `${site.assistantName}-${site.url}`, status: '크롤링 주기 도달 전' });
      }
    }

    res.status(200).json({ results });
  } catch (error) {
    console.error('scheduleCrawlingController 에러:', error);
    res.status(500).json({ error: '스케줄 크롤링 실행에 실패했습니다.' });
  }
}

